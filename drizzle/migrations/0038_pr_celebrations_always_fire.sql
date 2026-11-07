-- REPUNIT 0038: PR celebrations are independent from optional notification preferences.
-- In-app celebration events are product feedback, not marketing notifications.

begin;

create or replace function public.award_verified_pr_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_best numeric;
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
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(new.user_id, 50, 0, 0, null)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 50,
          updated_at = now();

    -- Always create the owner's PR event so the confetti fires for every PR.
    -- The separate notification preference still controls social/marketing events.
    insert into public.notifications(user_id, actor_id, kind, title, body, href)
    values(
      new.user_id, new.user_id, 'pr', 'New personal record!',
      'You just set a new ' || new.exercise::text || ' PR at ' || new.weight_kg::text || ' kg. +50 XP earned.',
      '/records/' || new.id::text
    );
  end if;
  return new;
end;
$$;

commit;
