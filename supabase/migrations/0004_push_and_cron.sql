-- Phase 1 step 4: push subscriptions (one per device), a log of alerts already sent, and the
-- scheduled jobs that run the notify and sync-done functions.
-- Additive only: nothing existing is changed.

create table public.push_subscriptions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
create policy "owner select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "owner insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "owner update" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner delete" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Which alerts have gone out, so none is sent twice. Only the server (service role) touches this.
create table public.notified (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notified enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;
