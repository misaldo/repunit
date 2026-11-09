-- Gentle weekly streaks, share-card support, and server-enforced push limits.
create table if not exists public.weekly_training_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_weeks integer not null default 0 check (current_weeks >= 0),
  longest_weeks integer not null default 0 check (longest_weeks >= 0),
  last_training_week date,
  freeze_week date,
  freeze_month date,
  updated_at timestamptz not null default now()
);

alter table public.weekly_training_streaks enable row level security;
drop policy if exists "Users can read their weekly streak" on public.weekly_training_streaks;
create policy "Users can read their weekly streak" on public.weekly_training_streaks
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.repunit_track_weekly_training()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  training_week date;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' and old.lifted_on = new.lifted_on then return new; end if;

  training_week := date_trunc('week', new.lifted_on::timestamp)::date;
  insert into public.weekly_training_streaks (user_id, current_weeks, longest_weeks, last_training_week)
  values (new.user_id, 1, 1, training_week)
  on conflict (user_id) do update set
    current_weeks = case
      when excluded.last_training_week = weekly_training_streaks.last_training_week then weekly_training_streaks.current_weeks
      when excluded.last_training_week = weekly_training_streaks.last_training_week + 7 then weekly_training_streaks.current_weeks + 1
      when weekly_training_streaks.freeze_week = weekly_training_streaks.last_training_week + 7
        and excluded.last_training_week = weekly_training_streaks.last_training_week + 14
        then weekly_training_streaks.current_weeks + 1
      else 1
    end,
    longest_weeks = greatest(
      weekly_training_streaks.longest_weeks,
      case
        when excluded.last_training_week = weekly_training_streaks.last_training_week then weekly_training_streaks.current_weeks
        when excluded.last_training_week = weekly_training_streaks.last_training_week + 7 then weekly_training_streaks.current_weeks + 1
        when weekly_training_streaks.freeze_week = weekly_training_streaks.last_training_week + 7
          and excluded.last_training_week = weekly_training_streaks.last_training_week + 14
          then weekly_training_streaks.current_weeks + 1
        else 1
      end
    ),
    last_training_week = greatest(weekly_training_streaks.last_training_week, excluded.last_training_week),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists repunit_weekly_training_streak on public.lifts;
create trigger repunit_weekly_training_streak
  after insert or update of status, lifted_on on public.lifts
  for each row execute function public.repunit_track_weekly_training();

create or replace function public.repunit_use_monthly_streak_freeze()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_week date := date_trunc('week', now())::date;
  month_start date := date_trunc('month', now())::date;
  streak public.weekly_training_streaks%rowtype;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  select * into streak from public.weekly_training_streaks where user_id = uid for update;
  if not found or streak.last_training_week is null then
    return jsonb_build_object('applied', false, 'reason', 'no_streak');
  end if;
  if streak.freeze_month = month_start then
    return jsonb_build_object('applied', false, 'reason', 'already_used');
  end if;
  if current_week <> streak.last_training_week + 14 then
    return jsonb_build_object('applied', false, 'reason', 'not_eligible');
  end if;
  update public.weekly_training_streaks
    set freeze_week = streak.last_training_week + 7,
        freeze_month = month_start,
        updated_at = now()
    where user_id = uid;
  return jsonb_build_object('applied', true, 'freeze_week', streak.last_training_week + 7);
end;
$$;
revoke all on function public.repunit_use_monthly_streak_freeze() from public;
grant execute on function public.repunit_use_monthly_streak_freeze() to authenticated;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true
);
alter table public.notification_preferences
  add column if not exists notify_friend_prs boolean not null default true,
  add column if not exists notify_challenges boolean not null default true,
  add column if not exists notify_crew_battles boolean not null default true,
  add column if not exists notify_events boolean not null default true,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time not null default '22:00',
  add column if not exists quiet_hours_end time not null default '08:00',
  add column if not exists timezone text not null default 'UTC';

alter table public.notification_preferences enable row level security;
drop policy if exists "Users manage their notification preferences" on public.notification_preferences;
create policy "Users manage their notification preferences" on public.notification_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_notification_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  sent_count integer not null default 0 check (sent_count between 0 and 3),
  primary key (user_id, local_date)
);
alter table public.push_notification_daily_usage enable row level security;

create or replace function public.repunit_claim_push_slot(_user_id uuid, _kind text default 'general')
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  prefs public.notification_preferences%rowtype;
  zone text := 'UTC';
  local_now timestamp;
  local_day date;
  local_clock time;
  allowed boolean := true;
begin
  select * into prefs from public.notification_preferences where user_id = _user_id;
  if found then
    if not prefs.push_enabled then return false; end if;
    allowed := case
      when _kind in ('friend_pr', 'pr') then prefs.notify_friend_prs
      when _kind in ('challenge', 'rivalry') then prefs.notify_challenges
      when _kind in ('crew_battle', 'battle') then prefs.notify_crew_battles
      when _kind in ('event', 'season') then prefs.notify_events
      else true
    end;
    if not allowed then return false; end if;
    zone := coalesce(nullif(prefs.timezone, ''), 'UTC');
  end if;

  begin
    local_now := now() at time zone zone;
  exception when others then
    local_now := now() at time zone 'UTC';
  end;
  local_day := local_now::date;
  local_clock := local_now::time;

  if found and prefs.quiet_hours_enabled then
    if prefs.quiet_hours_start < prefs.quiet_hours_end then
      if local_clock >= prefs.quiet_hours_start and local_clock < prefs.quiet_hours_end then return false; end if;
    else
      if local_clock >= prefs.quiet_hours_start or local_clock < prefs.quiet_hours_end then return false; end if;
    end if;
  end if;

  insert into public.push_notification_daily_usage (user_id, local_date, sent_count)
  values (_user_id, local_day, 1)
  on conflict (user_id, local_date) do update
    set sent_count = public.push_notification_daily_usage.sent_count + 1
    where public.push_notification_daily_usage.sent_count < 3;
  return found;
end;
$$;
revoke all on function public.repunit_claim_push_slot(uuid, text) from public, anon, authenticated;
grant execute on function public.repunit_claim_push_slot(uuid, text) to service_role;
