-- REPUNIT 0055: remove moderator approval and make the AI worker authoritative.
begin;

-- Convert old moderator-queue outcomes to the new terminal failure state.
update public.lifts
set status = 'NOT_VERIFIED',
    verified_at = null,
    verification_reason = coalesce(
      nullif(verification_reason, ''),
      'This lift has not passed automatic verification. Upload a clearer video to try again.'
    )
where status in ('AI_CHECKED', 'NEEDS_REVIEW', 'REJECTED');

-- Only the trusted worker may change submitted facts, AI evidence, or verification.
-- Guarded proof RPCs get a transaction-local capability for video/status transitions.
create or replace function public.protect_lift_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  workflow_update boolean :=
    coalesce(current_setting('repunit.lift_workflow', true), '') = 'on';
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or (new.video_path is distinct from old.video_path and not workflow_update)
      or (new.plate_video_path is distinct from old.plate_video_path and not workflow_update)
      or (new.status is distinct from old.status and not workflow_update)
      or (new.verification_reason is distinct from old.verification_reason and not workflow_update)
      or new.verified_at is distinct from old.verified_at
      or new.xp_awarded_at is distinct from old.xp_awarded_at
      or new.ai_reps_detected is distinct from old.ai_reps_detected
      or new.ai_reps_confidence is distinct from old.ai_reps_confidence
      or new.ai_reps_match is distinct from old.ai_reps_match
      or new.ai_weight_read_kg is distinct from old.ai_weight_read_kg
      or new.ai_weight_confidence is distinct from old.ai_weight_confidence
      or new.ai_weight_match is distinct from old.ai_weight_match
      or new.ai_analysis is distinct from old.ai_analysis then
      raise exception 'Lift evidence and verification can only be changed by the AI worker or guarded proof workflows'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

-- Replacing proof requeues the same lift for automatic analysis; it never approves it.
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
      verification_reason = 'Replacement video received. AI analysis is starting.',
      verified_at = null,
      ai_reps_detected = null,
      ai_reps_confidence = null,
      ai_reps_match = null,
      ai_weight_read_kg = null,
      ai_weight_confidence = null,
      ai_weight_match = null,
      ai_analysis = null
  where id = _lift_id
    and user_id = auth.uid()
    and status in (
      'NOT_VERIFIED', 'NEEDS_PROOF', 'UNDER_REVIEW', 'PENDING',
      'AI_CHECKED', 'NEEDS_REVIEW', 'REJECTED'
    )
  returning * into result_lift;
  perform set_config('repunit.lift_workflow', 'off', true);

  if result_lift.id is null then
    raise exception 'Only your unverified lift can receive replacement video'
      using errcode = '42501';
  end if;

  return result_lift;
end;
$function$;

revoke all on function public.attach_lift_video(uuid, text) from public, anon;
grant execute on function public.attach_lift_video(uuid, text) to authenticated;

-- The moderator queue is no longer part of the product.
drop function if exists public.admin_list_pending_lifts();
drop function if exists public.admin_review_lift(uuid, text);

commit;
notify pgrst, 'reload schema';
