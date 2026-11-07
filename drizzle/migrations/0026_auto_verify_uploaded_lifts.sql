-- REPUNIT 0026: automatically verify authenticated lift submissions only
-- after their video has been fully uploaded to the private lift-videos bucket.
--
-- The insert happens after the client upload request completes. Checking
-- storage.objects prevents a client from submitting an arbitrary video_path
-- and receiving VERIFIED without an actual object in the bucket.
--
-- Existing AFTER INSERT triggers see VERIFIED immediately, so XP, achievements,
-- friend call-outs, challenge resolution, throne events and notifications keep
-- using their existing paths without a second status update.

begin;

create or replace function public.require_pending_lift_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  submitting_user uuid := auth.uid();
begin
  -- Trusted server-side jobs retain their existing behavior.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if submitting_user is null or new.user_id is distinct from submitting_user then
    raise exception 'A lift must be submitted by its owner'
      using errcode = '42501';
  end if;

  if new.video_path is null or btrim(new.video_path) = '' then
    raise exception 'Upload a video before submitting a lift'
      using errcode = '23514';
  end if;

  if split_part(new.video_path, '/', 1) <> submitting_user::text then
    raise exception 'The uploaded video must belong to the submitting user'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'lift-videos'
      and o.name = new.video_path
  ) then
    raise exception 'The video upload has not completed. Please retry the submission.'
      using errcode = '23514';
  end if;

  -- Automatic MVP approval: an authenticated user with a real uploaded video
  -- is immediately eligible for the existing VERIFIED-only progression.
  new.status := 'VERIFIED';
  return new;
end;
$function$;

notify pgrst, 'reload schema';
commit;
