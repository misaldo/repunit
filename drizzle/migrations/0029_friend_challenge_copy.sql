-- REPUNIT 0029: friend call-outs include the exact PR that triggered them.
-- A mutual follow is the current friend relationship; the existing challenge
-- status workflow still supplies Accept / Ignore and win/loss tracking.

begin;

create or replace function public.notify_lifter_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  source_weight numeric;
  source_exercise text;
  lift_phrase text;
  message_body text;
begin
  select coalesce(display_name, username, 'A friend')
    into actor_name
  from public.profiles
  where id = new.challenger_id;

  if new.source_lift_id is not null then
    select weight_kg, exercise::text
      into source_weight, source_exercise
    from public.lifts
    where id = new.source_lift_id;

    lift_phrase := case source_exercise
      when 'bench' then 'benched'
      when 'squat' then 'squatted'
      when 'deadlift' then 'deadlifted'
      when 'ohp' then 'pressed overhead'
      else 'lifted'
    end;

    message_body := actor_name || ' just ' || lift_phrase || ' '
      || coalesce(source_weight::text, 'a new') || ' kg. Think you can do '
      || new.target_weight_kg::text || ' kg?';
  else
    message_body := actor_name || ' challenged you to ' || new.target_weight_kg::text || ' kg.';
  end if;

  insert into public.notifications(user_id, actor_id, kind, title, body, href)
  values (
    new.challenged_id,
    new.challenger_id,
    'challenge',
    'Friend challenge',
    left(message_body, 500),
    '/challenges'
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
