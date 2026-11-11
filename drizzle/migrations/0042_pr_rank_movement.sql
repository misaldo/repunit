-- REPUNIT 0042: include the exact exercise leaderboard movement in PR events.
-- Notifications remain private to their recipient; clients cannot write rank data.

begin;

alter table public.notifications
  add column if not exists previous_rank integer,
  add column if not exists new_rank integer;

alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

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
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  select max(weight_kg) into previous_best
  from public.lifts
  where user_id = new.user_id
    and exercise = new.exercise
    and status = 'VERIFIED'
    and id <> new.id;

  if previous_best is null or new.weight_kg > previous_best then
    -- Match the existing leaderboard's best-lift and ordering rules.
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
    select position into previous_rank from ranked where user_id = new.user_id;

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
    select position into new_rank from ranked where user_id = new.user_id;

    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(new.user_id, 50, 0, 0, null)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 50,
          updated_at = now();

    insert into public.notifications(
      user_id, actor_id, kind, title, body, href, previous_rank, new_rank
    )
    values(
      new.user_id, new.user_id, 'pr', 'New personal record!',
      'You just set a new ' || new.exercise::text || ' PR at ' || new.weight_kg::text || ' kg. +50 XP earned.',
      '/records/' || new.id::text, previous_rank, new_rank
    );
  end if;
  return new;
end;
$$;

commit;
notify pgrst, 'reload schema';
