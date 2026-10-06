-- Exams are a third kind of calendar item. The weekly class import leaves them alone.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events
  add constraint events_kind_check check (kind in ('class', 'event', 'exam'));
