-- REPUNIT progression hardening.
-- XP and streak values must only be changed by trusted database triggers, never by clients.
revoke insert, update on public.user_progress from authenticated;
drop policy if exists "users create own progress" on public.user_progress;
drop policy if exists "users update own progress" on public.user_progress;

-- Award workout XP only after a lift is verified. Pending/rejected submissions earn nothing.
create or replace function public.award_lift_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

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
  values (new.user_id, 'lift', 'Lift verified', 'Your lift was verified. You earned 25 XP.', '/records/' || new.id::text);

  return new;
end;
$$;

drop trigger if exists lifts_award_xp on public.lifts;
create trigger lifts_award_xp
after insert or update of status on public.lifts
for each row execute function public.award_lift_xp();

-- Award First PR only on the user's first verified lift in an exercise, not on a pending submission.
create or replace function public.award_lift_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_volume numeric;
  previous_best numeric;
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

  select max(weight_kg) into previous_best
  from public.lifts
  where user_id = new.user_id
    and exercise = new.exercise
    and status = 'VERIFIED'
    and id <> new.id;

  if previous_best is null or new.weight_kg > previous_best then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'first_pr')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  if new.exercise = 'bench' and new.weight_kg >= 100 then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'bench_100')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  select coalesce(sum(weight_kg * reps), 0) into total_volume
  from public.lifts
  where user_id = new.user_id and status = 'VERIFIED';

  if total_volume >= 1000 then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'volume_1000')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();
