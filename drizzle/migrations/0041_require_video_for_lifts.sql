-- REPUNIT 0041: Require video evidence for every new lift.
-- The browser form enforces this for usability; this trigger enforces it for
-- every authenticated client so the rule cannot be bypassed via direct API calls.

create or replace function public.require_lift_video_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $function$
begin
  if new.video_path is null or btrim(new.video_path) = '' then
    raise exception 'Video proof is required to submit a lift.'
      using errcode = '23514';
  end if;

  if split_part(new.video_path, '/', 1) <> auth.uid()::text then
    raise exception 'The uploaded video must belong to the submitting user.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'lift-videos'
      and o.name = new.video_path
      and o.metadata->>'mimetype' in ('video/mp4', 'video/quicktime', 'video/webm')
  ) then
    raise exception 'A valid uploaded video is required before the lift can be saved.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_lifts_require_video_before_insert on public.lifts;
create trigger trg_lifts_require_video_before_insert
before insert on public.lifts
for each row execute function public.require_lift_video_before_insert();

revoke all on function public.require_lift_video_before_insert() from public, anon, authenticated;

notify pgrst, 'reload schema';
