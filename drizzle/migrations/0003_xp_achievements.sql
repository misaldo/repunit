-- Additional REPUNIT progression rewards. Existing lift XP trigger remains the source of workout XP.
create or replace function public.award_streak_achievement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.current_streak >= 7 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'streak_7') on conflict(user_id, achievement_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists progress_streak_achievement on public.user_progress;
create trigger progress_streak_achievement after insert or update of current_streak on public.user_progress
for each row execute function public.award_streak_achievement();

create or replace function public.award_lift_achievements()
returns trigger language plpgsql security definer set search_path=public as $$
declare total_volume numeric;
begin
  if new.status <> 'REJECTED' then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'first_pr') on conflict(user_id, achievement_key) do nothing;
    if new.exercise = 'bench' and new.weight_kg >= 100 then
      insert into public.user_achievements(user_id, achievement_key)
      values(new.user_id, 'bench_100') on conflict(user_id, achievement_key) do nothing;
    end if;
    select coalesce(sum(weight_kg * reps),0) into total_volume from public.lifts
      where user_id = new.user_id and status <> 'REJECTED';
    if total_volume >= 1000 then
      insert into public.user_achievements(user_id, achievement_key)
      values(new.user_id, 'volume_1000') on conflict(user_id, achievement_key) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();

-- Give the author XP when another member likes one of their posts; duplicate likes cannot farm XP.
create or replace function public.award_like_xp()
returns trigger language plpgsql security definer set search_path=public as $$
declare post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(post_owner, 5, 0, 0, null)
    on conflict(user_id) do update set xp = public.user_progress.xp + 5, updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists likes_award_xp on public.likes;
create trigger likes_award_xp after insert on public.likes
for each row execute function public.award_like_xp();
