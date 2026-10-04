-- Distinguish timetable classes from one-off events (talks, orations, conclaves).
alter table public.events
  add column kind text not null default 'class' check (kind in ('class', 'event'));
