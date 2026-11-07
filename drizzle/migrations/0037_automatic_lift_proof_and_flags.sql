-- REPUNIT 0037: server-side lift plausibility, proof workflow and Crew flags.
-- New enum values are committed before any function uses them.
alter type public.lift_status add value if not exists 'NEEDS_PROOF';
alter type public.lift_status add value if not exists 'UNDER_REVIEW';

begin;

-- Keep the database's hard safety bounds broad enough to save out-of-range
-- submissions as NEEDS_PROOF instead of rejecting them before classification.
alter table public.lifts drop constraint if exists lifts_weight_kg_check;
alter table public.lifts drop constraint if exists lifts_reps_check;
alter table public.lifts
  add constraint lifts_weight_kg_check check (weight_kg >= 0 and weight_kg <= 9999.99),
  add constraint lifts_reps_check check (reps between 1 and 1000);

alter table public.lifts
  add column if not exists verification_reason text,
  add column if not exists xp_awarded_at timestamptz,
  add column if not exists verified_at timestamptz;

-- Existing verified lifts have already earned their progression rewards.
update public.lifts
set xp_awarded_at = coalesce(updated_at, created_at, now())
where status = 'VERIFIED' and xp_awarded_at is null;

update public.lifts
set verified_at = coalesce(updated_at, created_at, now())
where status = 'VERIFIED' and verified_at is null;

create table if not exists public.lift_flags (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  flagger_id uuid not null references public.profiles(id) on delete cascade,
  crew_id uuid not null references public.crews(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lift_id, flagger_id)
);
create index if not exists lift_flags_lift_id_idx on public.lift_flags(lift_id);
alter table public.lift_flags enable row level security;
revoke all on public.lift_flags from anon, authenticated;
grant select on public.lift_flags to authenticated;
drop policy if exists "shared crew members can read lift flags" on public.lift_flags;
create policy "shared crew members can read lift flags"
on public.lift_flags for select to authenticated
using (
  flagger_id = auth.uid()
  or exists (
    select 1 from public.crew_members cm
    where cm.crew_id = lift_flags.crew_id and cm.user_id = auth.uid()
  )
);

-- The browser cannot set status. Every normal insert is classified here.
create or replace function public.require_pending_lift_submission()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $function$
declare
  submitting_user uuid := auth.uid();
  previous_best numeric;
  daily_pr_jump_count integer;
  failure_reason text := null;
  daily_count integer;
  max_weight numeric;
  max_reps integer := 30;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if submitting_user is null or new.user_id is distinct from submitting_user then
    raise exception 'A lift must be submitted by its owner' using errcode = '42501';
  end if;

  -- Serialize submissions from one user so concurrent requests cannot bypass
  -- the daily cap, duplicate check or one-PR-jump rule.
  perform pg_advisory_xact_lock(hashtextextended(submitting_user::text, 370037));

  select count(*) into daily_count
  from public.lifts l
  where l.user_id = submitting_user
    and l.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
    and l.created_at < ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC');

  if daily_count >= 10 then
    failure_reason := 'Daily limit reached (10 lifts per day). Add video proof.';
  end if;

  max_weight := case new.exercise
    when 'bench' then 400
    when 'squat' then 500
    when 'deadlift' then 500
    when 'ohp' then 250
    when 'pullup' then 200
  end;

  if new.weight_kg < 0.5 or new.weight_kg > max_weight
     or new.reps < 1 or new.reps > max_reps then
    failure_reason := coalesce(failure_reason, 'Weight or reps are outside the plausible range for this exercise.');
  end if;

  if exists (
    select 1 from public.lifts l
    where l.user_id = submitting_user
      and l.exercise = new.exercise
      and l.weight_kg = new.weight_kg
      and l.reps = new.reps
      and l.lifted_on = new.lifted_on
  ) then
    failure_reason := coalesce(failure_reason, 'This looks like a duplicate lift. Add video proof.');
  end if;

  select max(l.weight_kg) into previous_best
  from public.lifts l
  where l.user_id = submitting_user
    and l.exercise = new.exercise
    and l.status = 'VERIFIED'
    and l.lifted_on < new.lifted_on;

  if new.weight_kg > coalesce(previous_best, 0) then
    if previous_best is not null and new.weight_kg > previous_best * 1.10 then
      failure_reason := coalesce(failure_reason, 'A PR jump over 10% needs video proof.');
    end if;
    select count(*)::integer into daily_pr_jump_count
    from public.lifts same_day
    where same_day.user_id = submitting_user
      and same_day.lifted_on = new.lifted_on
      and same_day.status = 'VERIFIED'
      and same_day.weight_kg > coalesce((
        select max(prior.weight_kg)
        from public.lifts prior
        where prior.user_id = same_day.user_id
          and prior.exercise = same_day.exercise
          and prior.status = 'VERIFIED'
          and prior.lifted_on < same_day.lifted_on
      ), 0);

    if coalesce(daily_pr_jump_count, 0) > 0 then
      failure_reason := coalesce(failure_reason, 'Only one unproven PR jump is allowed per user per day. Add video proof.');
    end if;
  end if;

  if new.video_path is not null and btrim(new.video_path) <> '' then
    if split_part(new.video_path, '/', 1) <> submitting_user::text then
      raise exception 'The uploaded video must belong to the submitting user' using errcode = '42501';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'lift-videos' and o.name = new.video_path
    ) then
      raise exception 'The video upload has not completed. Please retry the submission.' using errcode = '23514';
    end if;
    if daily_count >= 10 then
      new.status := 'NEEDS_PROOF';
      new.verification_reason := 'Daily limit reached (10 lifts per day). Replace the proof after the daily limit resets.';
      new.verified_at := null;
    else
      new.status := 'VERIFIED';
      new.verification_reason := null;
      new.verified_at := now();
    end if;
  else
    new.video_path := null;
    if failure_reason is null then
      new.status := 'VERIFIED';
      new.verification_reason := null;
      new.verified_at := now();
    else
      new.status := 'NEEDS_PROOF';
      new.verification_reason := failure_reason;
      new.verified_at := null;
    end if;
  end if;

  return new;
end;
$function$;

-- A client cannot edit lift facts, status or video path directly. Only the
-- proof/flag RPCs below can set the transaction-local workflow capability.
create or replace function public.protect_lift_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  workflow_update boolean :=
    coalesce(current_setting('repunit.lift_workflow', true), '') = 'on';
  admin_review boolean :=
    coalesce(current_setting('repunit.admin_lift_review', true), '') = 'on'
    and public.has_role(auth.uid(), 'admin');
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or (new.video_path is distinct from old.video_path and not workflow_update)
      or (new.status is distinct from old.status and not workflow_update and not admin_review)
      or new.verification_reason is distinct from old.verification_reason and not workflow_update then
      raise exception 'Lift evidence and verification status can only be changed through REPUNIT proof workflows'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

-- One-time progression rewards must not be paid again if a flagged lift is
-- returned to VERIFIED after its owner supplies proof.
create or replace function public.award_lift_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  update public.lifts
  set xp_awarded_at = now()
  where id = new.id and xp_awarded_at is null;
  if not found then return new; end if;

  insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
  values (new.user_id, 25, 1, 1, current_date)
  on conflict (user_id) do update set
    xp = public.user_progress.xp + 25,
    current_streak = case
      when public.user_progress.last_activity_on = current_date then public.user_progress.current_streak
      when public.user_progress.last_activity_on = current_date - 1 then public.user_progress.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      public.user_progress.longest_streak,
      case
        when public.user_progress.last_activity_on = current_date then public.user_progress.current_streak
        when public.user_progress.last_activity_on = current_date - 1 then public.user_progress.current_streak + 1
        else 1
      end
    ),
    last_activity_on = greatest(coalesce(public.user_progress.last_activity_on, current_date), current_date),
    updated_at = now();

  insert into public.notifications(user_id, kind, title, body, href)
  values (new.user_id, 'lift', 'Lift verified', 'Your lift is verified. You earned 25 XP.', '/records/' || new.id::text);

  return new;
end;
$function$;

-- Crew members may flag a lift only when they share at least one Crew with
-- its owner. A unique key prevents one member from counting more than once.
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
  if auth.uid() is null then raise exception 'Sign in to flag a lift' using errcode = '42501'; end if;

  select l.user_id, l.status into owner_id, current_status
  from public.lifts l where l.id = _lift_id for update;
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
  from public.lift_flags f where f.lift_id = _lift_id;

  if flag_count >= 3 and current_status not in ('UNDER_REVIEW', 'REJECTED') then
    perform set_config('repunit.lift_workflow', 'on', true);
    update public.lifts
    set status = 'UNDER_REVIEW',
        verification_reason = 'Flagged by three different Crew members. Video proof is required.'
    where id = _lift_id;
    perform set_config('repunit.lift_workflow', 'off', true);
  end if;

  return flag_count;
end;
$function$;

-- The owner can attach proof later. The storage object must exist and be in
-- their own folder; status is then restored to VERIFIED by this trusted RPC.
create or replace function public.attach_lift_video(_lift_id uuid, _video_path text)
returns public.lifts
language plpgsql
security definer
set search_path = public, storage
as $function$
declare
  result_lift public.lifts;
begin
  if auth.uid() is null then raise exception 'Sign in to add video proof' using errcode = '42501'; end if;
  if _video_path is null or btrim(_video_path) = ''
     or split_part(_video_path, '/', 1) <> auth.uid()::text then
    raise exception 'The video must be uploaded to your own private folder' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'lift-videos' and o.name = _video_path
  ) then
    raise exception 'The uploaded video could not be found' using errcode = '23514';
  end if;

  if (
    select count(*) from public.lifts l
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
  where id = _lift_id and user_id = auth.uid()
  returning * into result_lift;
  perform set_config('repunit.lift_workflow', 'off', true);

  if result_lift.id is null then raise exception 'Lift not found or you are not its owner' using errcode = '42501'; end if;

  -- Proof resolves the current flag wave; a fresh set of three different
  -- Crew members is required if the lift is flagged again later.
  delete from public.lift_flags where lift_id = _lift_id;
  return result_lift;
end;
$function$;

revoke all on function public.flag_lift(uuid) from public, anon;
revoke all on function public.attach_lift_video(uuid, text) from public, anon;
grant execute on function public.flag_lift(uuid) to authenticated;
grant execute on function public.attach_lift_video(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
