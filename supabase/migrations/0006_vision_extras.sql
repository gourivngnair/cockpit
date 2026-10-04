-- Phase 3: vision board extras. Additive only.
--  - width and height, so the grid can reserve each image's space before it loads (no jumping)
--  - pinned_on, the day an image was pinned as "today's vision" (at most one per day is used)
--  - live updates, so an upload on one device appears on the other
alter table public.vision
  add column width int not null default 0,
  add column height int not null default 0,
  add column pinned_on date;

create index vision_pinned_idx on public.vision (user_id, pinned_on);

alter publication supabase_realtime add table public.vision;
