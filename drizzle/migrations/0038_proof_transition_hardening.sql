-- REPUNIT 0038: make the Crew flag/proof transitions one-way and ranking-safe.
-- A flagged lift must stop contributing to previous-best calculations, and
-- video proof may resolve only a lift that is actually waiting for proof/review.

begin;

-- Older rows may have been flagged before this migration while retaining the
-- timestamp from their previous verified state. Clear that stale timestamp.
update public.lifts
set verified_at = null
where status <> 'VERIFIED' and verified_at is not null;

create or replace function public.flag_lift(_lift_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  owner_id uuid;
  shared_crew uuid;
  flag_count integer;
  current_status public.lift_status;
begin
  if auth.uid() is null then
    raise exception 'Sign in to flag a lift' using errcode = '42501';
  end if;

  select l.user_id, l.status into owner_id, current_status
  from public.lifts l
  where l.id = _lift_id
  for update;

  if owner_id is null then raise exception 'Lift not found' using errcode = 'P0002'; end if;
  if owner_id = auth.uid() then raise exception 'You cannot flag your own lift' using errcode = '42501'; end if;

  select mine.crew_id into shared_crew
  from public.crew_members mine
  join public.crew_members theirs on theirs.crew_id = mine.crew_id
  where mine.user_id = auth.uid() and theirs.user_id = owner_id
  order by mine.joined_at asc
  limit 1;

  if shared_crew is null then
    raise exception 'You must share a Crew with this lifter to flag the result' using errcode = '42501';
  end if;

  insert into public.lift_flags(lift_id, flagger_id, crew_id)
  values (_lift_id, auth.uid(), shared_crew)
  on conflict (lift_id, flagger_id) do nothing;

  select count(distinct f.flagger_id)::integer into flag_count
  from public.lift_flags f
  where f.lift_id = _lift_id;

  if flag_count >= 3 and current_status not in ('UNDER_REVIEW', 'REJECTED') then
    perform set_config('repunit.lift_workflow', 'on', true);
    update public.lifts
    set status = 'UNDER_REVIEW',
        verification_reason = 'Flagged by three different Crew members. Video proof is required.',
        verified_at = null
    where id = _lift_id;
    perform set_config('repunit.lift_workflow', 'off', true);
  end if;

  return flag_count;
end;
$function$;

create or replace function public.attach_lift_video(_lift_id uuid, _video_path text)
returns public.lifts
language plpgsql
security definer
set search_path = public, storage
as $function$
declare
  result_lift public.lifts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add video proof' using errcode = '42501';
  end if;

  if _video_path is null or btrim(_video_path) = ''
     or split_part(_video_path, '/', 1) <> auth.uid()::text then
    raise exception 'The video must be uploaded to your own private folder' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'lift-videos'
      and o.name = _video_path
      and o.metadata->>'mimetype' in ('video/mp4', 'video/quicktime', 'video/webm')
  ) then
    raise exception 'The uploaded video could not be found' using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.lifts l
    where l.user_id = auth.uid()
      and l.status = 'VERIFIED'
      and l.verified_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
      and l.verified_at < ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC')
      and l.id <> _lift_id
  ) >= 10 then
    raise exception 'You have reached the 10 verified lifts per day limit. Try again tomorrow.'
      using errcode = 'P0001';
  end if;

  perform set_config('repunit.lift_workflow', 'on', true);
  update public.lifts
  set video_path = _video_path,
      status = 'VERIFIED',
      verification_reason = null,
      verified_at = now()
  where id = _lift_id
    and user_id = auth.uid()
    and status in ('NEEDS_PROOF', 'UNDER_REVIEW', 'PENDING')
  returning * into result_lift;
  perform set_config('repunit.lift_workflow', 'off', true);

  if result_lift.id is null then
    raise exception 'Only your lifts waiting for proof or review can be verified with a video'
      using errcode = '42501';
  end if;

  -- Resolving proof clears the current flag wave. A new set of three distinct
  -- Crew members is required if the result is flagged again later.
  delete from public.lift_flags where lift_id = _lift_id;
  return result_lift;
end;
$function$;

notify pgrst, 'reload schema';
commit;
