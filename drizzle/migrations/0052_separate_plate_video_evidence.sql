-- REPUNIT 0052: store separate close-up evidence for loaded plates.
begin;
alter table public.lifts add column if not exists plate_video_path text;
comment on column public.lifts.plate_video_path is 'Private storage path for the separate plate-marking close-up used to screen declared load.';
commit;
notify pgrst, 'reload schema';
