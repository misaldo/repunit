-- REPUNIT 0016: make progression rewards match their labels and reward PRs/battles.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

-- A "First Verified Lift" badge must only unlock after verification.
create or replace function public.award_lift_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
declare total_volume numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;

  insert into public.user_achievements(user_id, achievement_key)
  values(new.user_id, 'first_pr')
  on conflict(user_id, achievement_key) do nothing;

  if new.exercise = 'bench' and new.weight_kg >= 100 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'bench_100')
    on conflict(user_id, achievement_key) do nothing;
  end if;

  select coalesce(sum(weight_kg * reps), 0) into total_volume
  from public.lifts
  where user_id = new.user_id and status = 'VERIFIED';

  if total_volume >= 1000 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'volume_1000')
    on conflict(user_id, achievement_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();

-- Add a one-time 50 XP bonus when a lift becomes a verified personal record.
create or replace function public.award_verified_pr_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous_best numeric;
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
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_award_verified_pr_xp on public.lifts;
create trigger lifts_award_verified_pr_xp
after insert or update of status on public.lifts
for each row execute function public.award_verified_pr_xp();

-- Crew milestones: a five-member squad and the 100-ton verified-volume club.
create or replace function public.award_crew_member_badges()
returns trigger language plpgsql security definer set search_path = public as $repunit$
begin
  if (select count(*) from public.crew_members where crew_id = new.crew_id) >= 5 then
    insert into public.crew_achievements(crew_id, achievement_key)
    values(new.crew_id, 'iron_squad')
    on conflict(crew_id, achievement_key) do nothing;
  end if;
  return new;
end;
$repunit$;
drop trigger if exists crew_members_award_badges on public.crew_members;
create trigger crew_members_award_badges
after insert on public.crew_members
for each row execute function public.award_crew_member_badges();

create or replace function public.award_crew_volume_badges()
returns trigger language plpgsql security definer set search_path = public as $repunit$
declare
  crew record;
  total_volume numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  for crew in select crew_id from public.crew_members where user_id = new.user_id loop
    select coalesce(sum(l.weight_kg * coalesce(l.reps,1)),0) into total_volume
    from public.lifts l
    join public.crew_members cm on cm.user_id = l.user_id
    where cm.crew_id = crew.crew_id and l.status = 'VERIFIED';
    if total_volume >= 100000 then
      insert into public.crew_achievements(crew_id, achievement_key)
      values(crew.crew_id, '100_ton_club')
      on conflict(crew_id, achievement_key) do nothing;
    end if;
  end loop;
  return new;
end;
$repunit$;
drop trigger if exists lifts_award_crew_volume_badges on public.lifts;
create trigger lifts_award_crew_volume_badges
after insert or update of status on public.lifts
for each row execute function public.award_crew_volume_badges();

-- Add a 10 XP bonus when a lifter extends an existing daily streak.
create or replace function public.award_streak_xp()
returns trigger language plpgsql security definer set search_path = public as $repunit$
begin
  if new.current_streak > old.current_streak and new.current_streak > 1 then
    update public.user_progress
      set xp = xp + 10, updated_at = now()
      where user_id = new.user_id;
  end if;
  return new;
end;
$repunit$;
drop trigger if exists progress_streak_award_xp on public.user_progress;
create trigger progress_streak_award_xp
after update of current_streak on public.user_progress
for each row execute function public.award_streak_xp();

-- Award every participant 20 XP once when a crew battle goes live.
create or replace function public.award_crew_battle_xp()
returns trigger language plpgsql security definer set search_path = public as $repunit$
begin
  if new.status <> 'active' or old.status = 'active' then return new; end if;

  insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
  select distinct cm.user_id, 20, 0, 0, null
  from public.crew_members cm
  where cm.crew_id in (new.challenger_crew_id, new.opponent_crew_id)
  on conflict(user_id) do update
    set xp = public.user_progress.xp + 20,
        updated_at = now();

  return new;
end;
$repunit$;

drop trigger if exists crew_battles_award_xp on public.crew_battles;
create trigger crew_battles_award_xp
after update of status on public.crew_battles
for each row execute function public.award_crew_battle_xp();



-- Lift-video engagement tables used by the video dialog.
create table if not exists public.lift_likes (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(lift_id, user_id)
);
alter table public.lift_likes enable row level security;
grant select, insert, delete on public.lift_likes to authenticated;
drop policy if exists "lift likes readable by signed in users" on public.lift_likes;
create policy "lift likes readable by signed in users" on public.lift_likes for select to authenticated using (true);
drop policy if exists "users like lifts as themselves" on public.lift_likes;
create policy "users like lifts as themselves" on public.lift_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users unlike lifts as themselves" on public.lift_likes;
create policy "users unlike lifts as themselves" on public.lift_likes for delete to authenticated using (user_id = auth.uid());

create table if not exists public.lift_comments (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists lift_comments_lift_created_idx on public.lift_comments(lift_id, created_at);
alter table public.lift_comments enable row level security;
grant select, insert on public.lift_comments to authenticated;
drop policy if exists "lift comments readable by signed in users" on public.lift_comments;
create policy "lift comments readable by signed in users" on public.lift_comments for select to authenticated using (true);
drop policy if exists "users comment on lifts as themselves" on public.lift_comments;
create policy "users comment on lifts as themselves" on public.lift_comments for insert to authenticated with check (user_id = auth.uid());

-- Reward post and lift owners for each unique like, without allowing unlike/re-like XP farming.
create table if not exists public.user_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,
  source_id uuid not null,
  xp integer not null check (xp > 0),
  created_at timestamptz not null default now()
);
alter table public.user_xp_events add column if not exists actor_id uuid references public.profiles(id) on delete cascade;
alter table public.user_xp_events drop constraint if exists user_xp_events_user_id_event_type_source_id_key;
alter table public.user_xp_events drop constraint if exists user_xp_events_user_event_source_actor_key;
alter table public.user_xp_events add constraint user_xp_events_user_event_source_actor_key
  unique(user_id, event_type, source_id, actor_id);
alter table public.user_xp_events enable row level security;
revoke all on public.user_xp_events from anon, authenticated;

create or replace function public.award_like_xp()
returns trigger language plpgsql security definer set search_path = public as $repunit$
declare
  recipient uuid;
  source uuid;
  event_kind text;
begin
  if tg_table_name = 'likes' then
    select user_id into recipient from public.posts where id = new.post_id;
    source := new.post_id;
    event_kind := 'post_like';
  elsif tg_table_name = 'lift_likes' then
    select user_id into recipient from public.lifts where id = new.lift_id;
    source := new.lift_id;
    event_kind := 'lift_like';
  else
    return new;
  end if;

  if recipient is null or recipient = new.user_id then return new; end if;

  insert into public.user_xp_events(user_id, actor_id, event_type, source_id, xp)
  values(recipient, new.user_id, event_kind, source, 2)
  on conflict(user_id, event_type, source_id) do nothing;

  if found then
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(recipient, 2, 0, 0, null)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 2,
          updated_at = now();
  end if;
  return new;
end;
$repunit$;

drop trigger if exists likes_award_xp on public.likes;
create trigger likes_award_xp after insert on public.likes
for each row execute function public.award_like_xp();

-- Notify lift owners when their evidence receives engagement.
create or replace function public.repunit_notify_lift_engagement()
returns trigger language plpgsql security definer set search_path = public as $repunit$
declare
  lift_owner uuid;
  actor_name text;
  event_kind text;
  event_title text;
  event_body text;
begin
  select user_id into lift_owner from public.lifts where id = new.lift_id;
  select coalesce(display_name, username, 'A lifter') into actor_name
    from public.profiles where id = new.user_id;
  if tg_table_name = 'lift_likes' then
    event_kind := 'like';
    event_title := 'Someone liked your lift';
    event_body := coalesce(actor_name, 'A lifter') || ' liked your lift video.';
  else
    event_kind := 'comment';
    event_title := 'New lift comment';
    event_body := coalesce(actor_name, 'A lifter') || ' commented: ' || left(new.content, 400);
  end if;
  perform public.repunit_create_notification(lift_owner, new.user_id, event_kind, event_title, event_body, '/records/' || new.lift_id::text);
  return new;
end;
$repunit$;
drop trigger if exists lift_likes_notify_owner on public.lift_likes;
create trigger lift_likes_notify_owner after insert on public.lift_likes
for each row execute function public.repunit_notify_lift_engagement();
drop trigger if exists lift_comments_notify_owner on public.lift_comments;
create trigger lift_comments_notify_owner after insert on public.lift_comments
for each row execute function public.repunit_notify_lift_engagement();

drop trigger if exists lift_likes_award_xp on public.lift_likes;
create trigger lift_likes_award_xp after insert on public.lift_likes
for each row execute function public.award_like_xp();

commit;
notify pgrst, 'reload schema';
