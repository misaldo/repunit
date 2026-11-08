-- REPUNIT 0043: repair PR celebration wiring on databases where older
-- migrations were pasted manually or only partially applied.
-- This migration is intentionally additive and safe to re-run.
--
-- It preserves award_lift_xp() (+25 XP and streak updates) and adds the
-- independent +50 XP PR reward plus rank movement notification.

begin;

alter table public.notifications
  add column if not exists previous_rank integer,
  add column if not exists new_rank integer;

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'users read own notifications'
  ) then
    create policy "users read own notifications"
      on public.notifications
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end;
$$;

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
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

  -- Serialize PR evaluation for this user/exercise so simultaneous lift
  -- submissions cannot both claim the same previous record.
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
    -- Rank before the new lift, using the same verified-only ordering as
    -- leaderboard_scoped: weight, reps, date, then username.
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
      select
        row_number() over (
          order by weight_kg desc, reps desc, lifted_on asc, username asc
        )::integer as position,
        user_id
      from best_per_user
    )
    select position
      into previous_rank
    from ranked
    where user_id = new.user_id;

    -- Rank after the new lift is included.
    with best_per_user as (
      select distinct on (l.user_id)
        l.user_id, l.weight_kg, l.reps, l.lifted_on, p.username
      from public.lifts l
      join public.profiles p on p.id = l.user_id
      where l.exercise = new.exercise
        and l.status = 'VERIFIED'
      order by l.user_id, l.weight_kg desc, l.reps desc, l.lifted_on asc
    ), ranked as (
      select
        row_number() over (
          order by weight_kg desc, reps desc, lifted_on asc, username asc
        )::integer as position,
        user_id
      from best_per_user
    )
    select position
      into new_rank
    from ranked
    where user_id = new.user_id;

    -- This is separate from award_lift_xp(): keep the existing +25 XP/streak
    -- behavior and add the one-time +50 XP PR bonus.
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
      new.user_id,
      new.user_id,
      'pr',
      'New personal record!',
      'You just set a new ' || new.exercise::text || ' PR at '
        || new.weight_kg::text || ' kg. +50 XP earned.',
      '/records/' || new.id::text,
      previous_rank,
      new_rank
    );
  end if;

  return new;
end;
$$;

-- The function alone does nothing unless its trigger is attached. Recreate
-- only this dedicated PR trigger; leave lifts_award_xp and all other triggers
-- untouched.
drop trigger if exists lifts_award_verified_pr_xp on public.lifts;
create trigger lifts_award_verified_pr_xp
after insert or update of status on public.lifts
for each row
execute function public.award_verified_pr_xp();

-- The celebration listens through Supabase Realtime. Add notifications to
-- the publication only if this project has the standard publication and the
-- table is not already included.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
