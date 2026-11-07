-- REPUNIT 0034: give rank takeovers and completed battle results clear notifications.

begin;

create or replace function public.repunit_notify_rank_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_top record;
  new_lifter text;
  exercise_name text;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  select l.user_id, p.username, l.weight_kg
    into previous_top
  from public.lifts l
  join public.profiles p on p.id = l.user_id
  where l.exercise = new.exercise
    and l.status = 'VERIFIED'
    and l.id <> new.id
  order by l.weight_kg desc, l.reps desc, l.lifted_on asc
  limit 1;

  if previous_top.user_id is not null
     and previous_top.user_id <> new.user_id
     and new.weight_kg > previous_top.weight_kg then
    select coalesce(display_name, username, 'A lifter')
      into new_lifter
    from public.profiles
    where id = new.user_id;
    exercise_name := case new.exercise::text
      when 'bench' then 'Bench'
      when 'squat' then 'Squat'
      when 'deadlift' then 'Deadlift'
      when 'ohp' then 'Overhead Press'
      else new.exercise::text
    end;

    perform public.repunit_create_notification(
      previous_top.user_id,
      new.user_id,
      'rank',
      'King of the Throne changed',
      coalesce(new_lifter, 'A lifter') || ' took the ' || exercise_name
        || ' throne with ' || new.weight_kg::text || ' kg. You were overtaken.',
      '/leaderboards'
    );
  end if;
  return new;
end;
$$;

create or replace function public.repunit_notify_battle_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  left_name text;
  right_name text;
  winner_name text;
  event_title text;
  event_body text;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('active','completed') then return new; end if;
  elsif old.status is not distinct from new.status then
    return new;
  elsif new.status not in ('active','completed') then
    return new;
  end if;

  select name into left_name from public.crews where id = new.challenger_crew_id;
  select name into right_name from public.crews where id = new.opponent_crew_id;

  if new.status = 'active' then
    event_title := 'Battle started';
    event_body := coalesce(left_name,'A crew') || ' vs ' || coalesce(right_name,'a crew') || ' is live. Your Crew is in the fight.';
  else
    event_title := 'Battle result';
    if new.winner_crew_id is not null then
      select name into winner_name from public.crews where id = new.winner_crew_id;
      event_body := coalesce(winner_name, 'A crew') || ' won the battle: '
        || coalesce(left_name,'A crew') || ' vs ' || coalesce(right_name,'a crew') || '. Open REPUNIT to see the result.';
    else
      event_body := coalesce(left_name,'A crew') || ' vs ' || coalesce(right_name,'a crew') || ' ended in a draw.';
    end if;
  end if;

  for member in
    select distinct user_id
    from public.crew_members
    where crew_id in (new.challenger_crew_id, new.opponent_crew_id)
  loop
    perform public.repunit_create_notification(
      member.user_id, null, 'battle', event_title, event_body,
      '/battles/' || new.id::text
    );
  end loop;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
