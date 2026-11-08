-- REPUNIT 0041: gentle retention mechanics.
--  1. One streak freeze per calendar month: a single missed day no longer resets a streak.
--  2. Push notification limits: quiet hours, a daily push cap and a delivery log.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Streak freeze
-- ---------------------------------------------------------------------------
alter table public.user_progress
  add column if not exists streak_freezes integer not null default 1,
  add column if not exists freeze_refilled_on date;

alter table public.user_progress drop constraint if exists user_progress_streak_freezes_range;
alter table public.user_progress
  add constraint user_progress_streak_freezes_range check (streak_freezes between 0 and 1);

-- Clients must never be able to grant themselves freezes.
revoke insert, update on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;

-- Returns true when a freeze was spent and the streak survives.
-- A freeze only covers exactly one missed day (last activity two days ago).
create or replace function public.repunit_try_streak_freeze(_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  progress_row public.user_progress%rowtype;
  this_month date := date_trunc('month', current_date)::date;
begin
  select * into progress_row from public.user_progress where user_id = _user for update;
  if not found or progress_row.current_streak <= 0 or progress_row.last_activity_on is null then
    return false;
  end if;

  -- Monthly refill.
  if progress_row.freeze_refilled_on is distinct from this_month then
    update public.user_progress
      set streak_freezes = 1, freeze_refilled_on = this_month
      where user_id = _user;
    progress_row.streak_freezes := 1;
  end if;

  if progress_row.streak_freezes < 1 or progress_row.last_activity_on <> current_date - 2 then
    return false;
  end if;

  update public.user_progress
    set streak_freezes = streak_freezes - 1,
        last_activity_on = current_date - 1,
        updated_at = now()
    where user_id = _user;

  if public.repunit_notification_enabled(_user, 'streak') then
    insert into public.notifications(user_id, kind, title, body, href)
    values (
      _user, 'streak', 'Streak freeze used',
      'You missed a day, so a freeze kept your ' || progress_row.current_streak::text ||
      '-day streak alive. Log a lift today to keep it going.',
      '/dashboard'
    );
  end if;
  return true;
end;
$$;
revoke all on function public.repunit_try_streak_freeze(uuid) from public, anon, authenticated;
grant execute on function public.repunit_try_streak_freeze(uuid) to service_role;

-- On-visit streak check (signed-in user only): try a freeze before ending the streak.
create or replace function public.repunit_check_my_streak_loss()
returns void language plpgsql security definer set search_path = public as $$
declare
  progress_row public.user_progress%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into progress_row from public.user_progress where user_id = auth.uid() for update;
  if not found or progress_row.current_streak <= 0 or progress_row.last_activity_on is null then return; end if;

  if progress_row.last_activity_on < current_date - 1 then
    if public.repunit_try_streak_freeze(auth.uid()) then return; end if;
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

-- Scheduled streak check (pg_cron / service role): same rule for everyone.
create or replace function public.repunit_check_streak_losses()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer := 0; item record;
begin
  for item in
    select up.user_id, up.current_streak, up.last_activity_on
    from public.user_progress up
    where up.current_streak > 0
      and up.last_activity_on < current_date - 1
  loop
    if public.repunit_try_streak_freeze(item.user_id) then
      continue;
    end if;

    update public.user_progress
      set current_streak = 0, updated_at = now()
      where user_id = item.user_id and current_streak > 0;
    affected := affected + 1;

    if public.repunit_notification_enabled(item.user_id, 'streak') then
      insert into public.notifications(user_id, kind, title, body, href)
      select item.user_id, 'streak', 'Your streak ended',
        'Your ' || item.current_streak::text || '-day training streak has ended. Start a new one today.',
        '/dashboard'
      where not exists (
        select 1 from public.notifications n
        where n.user_id = item.user_id and n.kind = 'streak'
          and n.created_at::date = current_date
          and n.title = 'Your streak ended'
      );
    end if;
  end loop;
  return affected;
end;
$$;
grant execute on function public.repunit_check_streak_losses() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Push limits: quiet hours, daily cap, delivery log
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_start smallint not null default 22,
  add column if not exists quiet_end smallint not null default 8,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists daily_push_cap smallint not null default 3;

alter table public.notification_preferences drop constraint if exists notification_preferences_quiet_range;
alter table public.notification_preferences
  add constraint notification_preferences_quiet_range check (
    quiet_start between 0 and 23 and quiet_end between 0 and 23
    and daily_push_cap between 1 and 20
    and char_length(timezone) between 1 and 64
  );

create table if not exists public.push_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists push_deliveries_user_sent_idx on public.push_deliveries(user_id, sent_at desc);

-- Server-only table: RLS on, no policies, no client grants. The send-push Edge
-- Function writes to it with the service role.
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public, anon, authenticated;
grant all on public.push_deliveries to service_role;

commit;
notify pgrst, 'reload schema';
