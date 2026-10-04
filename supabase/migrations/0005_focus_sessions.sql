-- Phase 2: a log of focus sessions (one row per focus round, whole or partial), used for the
-- "focused time" on each task and, later, for the Progress page. Additive only.
-- The timer's own state already lives in the `focus` table (one row per user).

create table public.focus_sessions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null, -- deterministic for a finished round, so two devices cannot log it twice
  task_id text,
  content text not null default '',
  project_id text not null default '',
  started_at timestamptz not null,
  minutes int not null check (minutes between 1 and 240),
  completed boolean not null default true, -- false when the round was ended early
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index focus_sessions_task_idx on public.focus_sessions (user_id, task_id);

alter table public.focus_sessions enable row level security;
create policy "owner select" on public.focus_sessions for select using (user_id = auth.uid());
create policy "owner insert" on public.focus_sessions for insert with check (user_id = auth.uid());
create policy "owner update" on public.focus_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner delete" on public.focus_sessions for delete using (user_id = auth.uid());
