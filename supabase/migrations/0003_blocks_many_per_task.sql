-- A task may have several work blocks (splitting work across days).
-- Phase 0 created blocks with primary key (user_id, task_id), which allows only one.
-- No block rows exist yet, so this changes the key only; no data is touched.
alter table public.blocks add column id uuid not null default gen_random_uuid();
alter table public.blocks drop constraint blocks_pkey;
alter table public.blocks add primary key (user_id, id);
create index blocks_task_idx on public.blocks (user_id, task_id);
