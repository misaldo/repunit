-- REPUNIT 0048: fail closed until a real video analysis has completed.
-- An uploaded file is evidence to inspect, not proof that the declared lift happened.
-- Trusted analysis workers may update statuses with the service_role key only.

begin;

create table if not exists public.lift_video_fingerprints (
  lift_id uuid primary key references public.lifts(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  frame_hashes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists lift_video_fingerprints_sha256_uidx
  on public.lift_video_fingerprints (sha256);

alter table public.lift_video_fingerprints enable row level security;
revoke all on public.lift_video_fingerprints from public, anon, authenticated;
grant all on public.lift_video_fingerprints to service_role;

-- Run after the legacy classifier trigger. This deliberately overrides its
-- unsafe "video attached = VERIFIED" behavior for every client submission.
create or replace function public.repunit_force_lift_ai_review()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $function$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.video_path is null or btrim(new.video_path) = '' then
    raise exception 'Video proof is required before AI review.'
      using errcode = '23514';
  end if;

  new.status := 'AI_ANALYZING';
  new.verification_reason := 'Video received. Waiting for video analysis.';
  new.verified_at := null;
  new.xp_awarded_at := null;
  return new;
end;
$function$;

drop trigger if exists zzzz_lifts_require_ai_review on public.lifts;
create trigger zzzz_lifts_require_ai_review
before insert on public.lifts
for each row execute function public.repunit_force_lift_ai_review();

-- Attaching replacement proof must also enter analysis. It must never verify
-- a lift merely because a storage object exists.
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

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 370037));

  if _video_path is null or btrim(_video_path) = ''
     or split_part(_video_path, '/', 1) <> auth.uid()::text then
    raise exception 'The video must be uploaded to your own private folder' using errcode = '42501';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'lift-videos'
      and o.name = _video_path
      and o.metadata->>'mimetype' in ('video/mp4', 'video/quicktime', 'video/webm')
  ) then
    raise exception 'The uploaded video could not be found' using errcode = '23514';
  end if;

  perform set_config('repunit.lift_workflow', 'on', true);
  update public.lifts
  set video_path = _video_path,
      status = 'AI_ANALYZING',
      verification_reason = 'Replacement video received. Waiting for video analysis.',
      verified_at = null
  where id = _lift_id
    and user_id = auth.uid()
    and status in ('NEEDS_PROOF', 'UNDER_REVIEW', 'PENDING', 'NEEDS_REVIEW', 'REJECTED')
  returning * into result_lift;
  perform set_config('repunit.lift_workflow', 'off', true);

  if result_lift.id is null then
    raise exception 'Only your lift waiting for proof or review can receive replacement video'
      using errcode = '42501';
  end if;

  return result_lift;
end;
$function$;

revoke all on function public.attach_lift_video(uuid, text) from public, anon;
grant execute on function public.attach_lift_video(uuid, text) to authenticated;
revoke all on function public.repunit_force_lift_ai_review() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
