-- REPUNIT friend call-outs and one-to-one lifting challenges.
begin;

alter table public.lifter_challenges
  add column if not exists source_lift_id uuid references public.lifts(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists lifter_challenges_inbox_idx
  on public.lifter_challenges(challenged_id, status, created_at desc);
create index if not exists lifter_challenges_outbox_idx
  on public.lifter_challenges(challenger_id, status, created_at desc);

-- A challenge creates a notification for its recipient. The UI renders Accept / Ignore.
create or replace function public.notify_lifter_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  exercise_name text;
begin
  select coalesce(display_name, username) into actor_name
  from public.profiles where id = new.challenger_id;
  exercise_name := case new.exercise
    when 'bench' then 'benched'
    when 'squat' then 'squatted'
    when 'deadlift' then 'deadlifted'
    when 'ohp' then 'pressed'
    when 'pullup' then 'did pull-ups with'
    else 'lifted' end;

  insert into public.notifications(user_id, actor_id, kind, title, body, href)
  values (
    new.challenged_id,
    new.challenger_id,
    'challenge',
    'You got called out',
    coalesce(actor_name, 'A friend') || ' challenged you to ' || new.target_weight_kg::text || ' kg. Can you beat it?',
    '/challenges'
  );
  return new;
end;
$$;

drop trigger if exists lifter_challenge_notification on public.lifter_challenges;
create trigger lifter_challenge_notification
after insert on public.lifter_challenges
for each row execute function public.notify_lifter_challenge();

-- Every mutual follow (friend) receives an automatic call-out when a lift is logged.
create or replace function public.create_friend_lift_callouts()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  if new.weight_kg < 600 then
    insert into public.lifter_challenges(
      challenger_id, challenged_id, exercise, target_weight_kg, source_lift_id, due_at
    )
    select new.user_id, f.follower_id, new.exercise,
           least(new.weight_kg + 2.5, 600), new.id, now() + interval '7 days'
    from public.follows f
    where f.following_id = new.user_id
      and f.follower_id <> new.user_id
      and exists (
        select 1 from public.follows mutual
        where mutual.follower_id = new.user_id
          and mutual.following_id = f.follower_id
      );
  end if;
  return new;
end;
$;

drop trigger if exists lifts_create_friend_callouts on public.lifts;
create trigger lifts_create_friend_callouts
after insert on public.lifts
for each row execute function public.create_friend_lift_callouts();

-- When a verified lift beats the target, close the accepted challenge and record its winner.
create or replace function public.resolve_lifter_challenges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'VERIFIED' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.lifter_challenges c
    set status = 'completed',
        winner_id = new.user_id,
        completed_at = now()
    where c.status = 'accepted'
      and c.exercise = new.exercise
      and c.due_at >= now()
      and new.lifted_on >= c.created_at::date
      and (
        (c.challenged_id = new.user_id and new.weight_kg >= c.target_weight_kg)
        or
        (c.challenger_id = new.user_id and new.weight_kg >= c.target_weight_kg + 2.5)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_resolve_lifter_challenges on public.lifts;
create trigger lifts_resolve_lifter_challenges
after insert or update of status on public.lifts
for each row execute function public.resolve_lifter_challenges();

-- A rejected/expired challenge is a loss for the original caller.
create or replace function public.expire_lifter_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.lifter_challenges
  set status = 'failed', winner_id = challenger_id, completed_at = now()
  where status = 'accepted' and due_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.expire_lifter_challenges() to authenticated;

commit;

notify pgrst, 'reload schema';
