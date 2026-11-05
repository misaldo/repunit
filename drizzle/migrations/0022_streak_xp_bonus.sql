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

-- Fallback for projects without pg_cron: check the signed-in user's streak on app open.
create or replace function public.repunit_check_my_streak_loss()
returns void language plpgsql security definer set search_path = public as $$
declare
  progress_row public.user_progress%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into progress_row from public.user_progress where user_id = auth.uid() for update;
  if not found or progress_row.current_streak <= 0 or progress_row.last_activity_on is null then return; end if;

  if progress_row.last_activity_on < current_date - 1 then
    update public.user_progress
      set current_streak = 0, updated_at = now()
      where user_id = auth.uid() and current_streak > 0;
    if public.repunit_notification_enabled(auth.uid(), 'streak') then
      insert into public.notifications(user_id, kind, title, body, href)
      values(
        auth.uid(), 'streak', 'Your streak ended',
        'Your ' || progress_row.current_streak::text || '-day streak has ended. Start a new one today.',
        '/dashboard'
      );
    end if;
  end if;
end;
$$;
grant execute on function public.repunit_check_my_streak_loss() to authenticated;

commit;
notify pgrst, 'reload schema';
