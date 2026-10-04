-- Cockpit Phase 0 schema. Every table has row-level security: only the
-- signed-in owner can read or write their own rows.

create table public.blocks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id text not null,
  date date not null,
  start_time time not null,
  minutes int not null check (minutes between 15 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- One row per task occurrence (copy of Todoist completions; see PRD lesson 5).
create table public.done (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  task_id text not null,
  content text not null default '',
  labels text[] not null default '{}',
  project_id text not null default '',
  date date not null,
  completed_at timestamptz not null,
  late boolean not null default false,
  recurring boolean not null default false,
  primary key (user_id, id)
);

create table public.diet (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  ok boolean not null,
  primary key (user_id, date)
);

create table public.marks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id uuid not null default gen_random_uuid(),
  course text not null,
  what text not null default '',
  score text not null,
  max text not null default '',
  date date not null default current_date,
  primary key (user_id, id)
);

-- Class and meeting events, entered weekly.
create table public.events (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  room text not null default '',
  primary key (user_id, id)
);

-- Focus timer state and settings (one row per user).
create table public.focus (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.vision (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id uuid not null default gen_random_uuid(),
  storage_path text not null,
  caption text not null default '',
  theme text not null default 'Unsorted',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['blocks','done','diet','marks','events','focus','vision'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "owner insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "owner update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "owner delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Realtime, so a change on one device shows on the other.
alter publication supabase_realtime add table public.blocks, public.events, public.diet, public.focus;

-- Private bucket for vision images; files live under <user id>/...
insert into storage.buckets (id, name, public) values ('vision', 'vision', false);
create policy "owner reads vision files" on storage.objects for select
  using (bucket_id = 'vision' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner writes vision files" on storage.objects for insert
  with check (bucket_id = 'vision' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes vision files" on storage.objects for delete
  using (bucket_id = 'vision' and (storage.foldername(name))[1] = auth.uid()::text);
