-- REPUNIT 0044: count genuine verified personal-record breakthroughs.
-- Historical PRs are backfilled from each lifter's verified lift history.
-- Only the server-side verification trigger can write new PR events.

begin;

create table if not exists public.user_pr_events (
  lift_id uuid primary key references public.lifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise text not null,
  weight_kg numeric not null check (weight_kg >= 0),
  created_at timestamptz not null
);

create index if not exists user_pr_events_user_created_idx
  on public.user_pr_events(user_id, created_at desc);

alter table public.user_pr_events enable row level security;
revoke all on public.user_pr_events from anon, authenticated;
grant select on public.user_pr_events to authenticated;

drop policy if exists "users read own PR events" on public.user_pr_events;
create policy "users read own PR events"
  on public.user_pr_events for select to authenticated
  using (user_id = auth.uid());

-- Backfill every verified lift that was a strict all-time weight PR
-- at the moment it was recorded. Re-running is safe.
with ordered_lifts as (
  select
    l.id,
    l.user_id,
    l.exercise::text as exercise,
    l.weight_kg,
    l.created_at,
    max(l.weight_kg) over (
      partition by l.user_id, l.exercise
      order by l.created_at, l.id
      rows between unbounded preceding and 1 preceding
    ) as previous_best
  from public.lifts l
  where l.status = 'VERIFIED'
)
insert into public.user_pr_events(lift_id, user_id, exercise, weight_kg, created_at)
select id, user_id, exercise, weight_kg, created_at
from ordered_lifts
where previous_best is null or weight_kg > previous_best
on conflict (lift_id) do nothing;

-- Preserve the existing leaderboard-rank notification and +50 XP reward,
-- while recording the PR and unlocking the two-PR milestone exactly once.
create or replace function public.award_verified_pr_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_best numeric;
  previous_rank integer;
  new_rank integer;
  total_prs integer;
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || new.exercise::text, 0)
  );

  select max(weight_kg)
    into previous_best
  from public.lifts
  where user_id = new.user_id
    and exercise = new.exercise
    and status = 'VERIFIED'
    and id <> new.id;

  if previous_best is null or new.weight_kg > previous_best then
    with best_per_user as (
      select distinct on (l.user_id)
        l.user_id, l.weight_kg, l.reps, l.lifted_on, p.username
      from public.lifts l
      join public.profiles p on p.id = l.user_id
      where l.exercise = new.exercise
        and l.status = 'VERIFIED'
        and l.id <> new.id
      order by l.user_id, l.weight_kg desc, l.reps desc, l.lifted_on asc
    ), ranked as (
      select row_number() over (
        order by weight_kg desc, reps desc, lifted_on asc, username asc
      )::integer as position, user_id
      from best_per_user
    )
    select position into previous_rank
    from ranked where user_id = new.user_id;

    with best_per_user as (
      select distinct on (l.user_id)
        l.user_id, l.weight_kg, l.reps, l.lifted_on, p.username
      from public.lifts l
      join public.profiles p on p.id = l.user_id
      where l.exercise = new.exercise
        and l.status = 'VERIFIED'
      order by l.user_id, l.weight_kg desc, l.reps desc, l.lifted_on asc
    ), ranked as (
      select row_number() over (
        order by weight_kg desc, reps desc, lifted_on asc, username asc
      )::integer as position, user_id
      from best_per_user
    )
    select position into new_rank
    from ranked where user_id = new.user_id;

    insert into public.user_pr_events(lift_id, user_id, exercise, weight_kg, created_at)
    values (new.id, new.user_id, new.exercise::text, new.weight_kg, new.created_at)
    on conflict (lift_id) do nothing;

    select count(*)::integer into total_prs
    from public.user_pr_events
    where user_id = new.user_id;

    if total_prs >= 2 then
      insert into public.user_achievements(user_id, achievement_key)
      values (new.user_id, 'pr_duo')
      on conflict (user_id, achievement_key) do nothing;
    end if;

    insert into public.user_progress(
      user_id, xp, current_streak, longest_streak, last_activity_on
    )
    values (new.user_id, 50, 0, 0, null)
    on conflict (user_id) do update
      set xp = public.user_progress.xp + 50,
          updated_at = now();

    insert into public.notifications(
      user_id, actor_id, kind, title, body, href, previous_rank, new_rank
    )
    values (
      new.user_id, new.user_id, 'pr', 'New personal record!',
      'You just set a new ' || new.exercise::text || ' PR at '
        || new.weight_kg::text || ' kg. +50 XP earned.',
      '/records/' || new.id::text, previous_rank, new_rank
    );
  end if;

  return new;
end;
$$;

-- Unlock the badge for users whose historical verified lifts already
-- contain at least two real PR breakthroughs.
insert into public.user_achievements(user_id, achievement_key)
select user_id, 'pr_duo'
from public.user_pr_events
group by user_id
having count(*) >= 2
on conflict (user_id, achievement_key) do nothing;

commit;
notify pgrst, 'reload schema';
