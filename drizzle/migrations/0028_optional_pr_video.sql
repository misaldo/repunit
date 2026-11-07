-- REPUNIT 0028: PR video evidence is optional.
-- User-submitted PRs count in rankings immediately; an attached video is
-- optional supporting evidence and must belong to the submitting user.
-- This is self-reported competition, not AI judging or technique verification.

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
  if auth.role() = 'service_role' then
    return new;
  end if;

  if submitting_user is null or new.user_id is distinct from submitting_user then
    raise exception 'A lift must be submitted by its owner'
      using errcode = '42501';
  end if;

  if new.video_path is not null and btrim(new.video_path) <> '' then
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
  else
    new.video_path := null;
  end if;

  -- REPUNIT rankings are based on self-reported PRs. Video is optional proof;
  -- no computer vision or human technique review is implied by this status.
  new.status := 'VERIFIED';
  return new;
end;
$function$;

notify pgrst, 'reload schema';
commit;
