-- REPUNIT 0016: make progression rewards match their labels and reward PRs/battles.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

-- A "First Verified Lift" badge must only unlock after verification.
create or replace function public.award_lift_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
declare total_volume numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;

  insert into public.user_achievements(user_id, achievement_key)
  values(new.user_id, 'first_pr')
  on conflict(user_id, achievement_key) do nothing;

  if new.exercise = 'bench' and new.weight_kg >= 100 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'bench_100')
    on conflict(user_id, achievement_key) do nothing;
  end if;

  select coalesce(sum(weight_kg * reps), 0) into total_volume
  from public.lifts
  where user_id = new.user_id and status = 'VERIFIED';

  if total_volume >= 1000 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'volume_1000')
    on conflict(user_id, achievement_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();

-- Add a one-time 50 XP bonus when a lift becomes a verified personal record.
create or replace function public.award_verified_pr_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous_best numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  select max(weight_kg) into previous_best
  from public.lifts
  where user_id = new.user_id
    and exercise = new.exercise
    and status = 'VERIFIED'
    and id <> new.id;

  if previous_best is null or new.weight_kg > previous_best then
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(new.user_id, 50, 0, 0, null)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 50,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_award_verified_pr_xp on public.lifts;
create trigger lifts_award_verified_pr_xp
after insert or update of status on public.lifts
for each row execute function public.award_verified_pr_xp();

-- Award every participant 20 XP once when a crew battle is completed.
create or replace function public.award_crew_battle_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;

  insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
  select distinct cm.user_id, 20, 0, 0, null
  from public.crew_members cm
  where cm.crew_id in (new.challenger_crew_id, new.opponent_crew_id)
  on conflict(user_id) do update
    set xp = public.user_progress.xp + 20,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists crew_battles_award_xp on public.crew_battles;
create trigger crew_battles_award_xp
after update of status on public.crew_battles
for each row execute function public.award_crew_battle_xp();

commit;
notify pgrst, 'reload schema';
