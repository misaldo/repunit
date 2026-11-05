-- REPUNIT 0022: grant bonus XP for weekly streak milestones.

begin;

create or replace function public.award_lift_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := current_date;
  previous_streak integer := 0;
  previous_activity date;
  next_streak integer := 1;
  streak_bonus integer := 0;
begin
  select current_streak, last_activity_on
    into previous_streak, previous_activity
  from public.user_progress
  where user_id = new.user_id
  for update;

  if previous_activity = today then
    next_streak := greatest(previous_streak, 1);
  elsif previous_activity = today - 1 then
    next_streak := greatest(previous_streak, 0) + 1;
  else
    next_streak := 1;
  end if;

  if previous_activity is distinct from today and next_streak > 0 and mod(next_streak, 7) = 0 then
    streak_bonus := 50;
  end if;

  insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
  values(new.user_id, 25 + streak_bonus, next_streak, next_streak, today)
  on conflict(user_id) do update set
    xp = public.user_progress.xp + 25 + streak_bonus,
    current_streak = next_streak,
    longest_streak = greatest(public.user_progress.longest_streak, next_streak),
    last_activity_on = today,
    updated_at = now();

  return new;
end;
$$;

commit;
notify pgrst, 'reload schema';
