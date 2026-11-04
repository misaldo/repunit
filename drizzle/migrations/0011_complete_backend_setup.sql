-- REPUNIT backend catch-up for projects where 0000 and 0007 have already been run.
-- Run this ONE time in Supabase SQL Editor after 0000_migration.sql and 0007_crew_upgrade.sql.
-- It creates missing social dependencies and applies the remaining schema in dependency order.

begin;

-- ===== drizzle/migrations/0000a_social_dependencies.sql =====
-- REPUNIT social dependencies required by workout visibility and XP triggers.
-- Run this once after 0000_migration.sql and before 0001_workouts_challenges_security.sql.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows(following_id, created_at desc);
alter table public.follows enable row level security;
grant select, insert, delete on public.follows to authenticated;
drop policy if exists "follows visible to signed in users" on public.follows;
create policy "follows visible to signed in users" on public.follows for select to authenticated using (true);
drop policy if exists "users follow as themselves" on public.follows;
create policy "users follow as themselves" on public.follows for insert to authenticated with check (follower_id = auth.uid() and follower_id <> following_id);
drop policy if exists "users unfollow as themselves" on public.follows;
create policy "users unfollow as themselves" on public.follows for delete to authenticated using (follower_id = auth.uid());

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_id uuid references public.lifts(id) on delete set null,
  content text check (char_length(content) <= 2000),
  media_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);
alter table public.posts enable row level security;
grant select, insert, update, delete on public.posts to authenticated;
drop policy if exists "posts readable by signed in users" on public.posts;
create policy "posts readable by signed in users" on public.posts for select to authenticated using (true);
drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts" on public.posts for delete to authenticated using (user_id = auth.uid());

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists likes_post_idx on public.likes(post_id, created_at desc);
alter table public.likes enable row level security;
grant select, insert, delete on public.likes to authenticated;
drop policy if exists "likes readable by signed in users" on public.likes;
create policy "likes readable by signed in users" on public.likes for select to authenticated using (true);
drop policy if exists "users like as themselves" on public.likes;
create policy "users like as themselves" on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users unlike as themselves" on public.likes;
create policy "users unlike as themselves" on public.likes for delete to authenticated using (user_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at);
alter table public.comments enable row level security;
grant select, insert, delete on public.comments to authenticated;
drop policy if exists "comments readable by signed in users" on public.comments;
create policy "comments readable by signed in users" on public.comments for select to authenticated using (true);
drop policy if exists "users create own comments" on public.comments;
create policy "users create own comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());


-- ===== drizzle/migrations/0001_workouts_challenges_security.sql =====
-- REPUNIT: workout plans, challenges and trusted lift verification
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  visibility text not null default 'private' check (visibility in ('public','private','followers')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_plans_user_created_idx on public.workout_plans(user_id, created_at desc);
create index if not exists workout_plans_visibility_idx on public.workout_plans(visibility, created_at desc);
alter table public.workout_plans enable row level security;
grant select, insert, update, delete on public.workout_plans to authenticated;
create policy "workout plans readable by visibility" on public.workout_plans for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'followers' and exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = user_id
  ))
);
create policy "users create own workout plans" on public.workout_plans for insert to authenticated with check (user_id = auth.uid());
create policy "users update own workout plans" on public.workout_plans for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own workout plans" on public.workout_plans for delete to authenticated using (user_id = auth.uid());

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  sets integer not null check (sets between 1 and 30),
  reps text not null check (char_length(reps) between 1 and 20),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  notes text check (char_length(notes) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workout_plan_exercises_plan_idx on public.workout_plan_exercises(plan_id, position);
alter table public.workout_plan_exercises enable row level security;
grant select, insert, update, delete on public.workout_plan_exercises to authenticated;
create policy "exercises readable with plan" on public.workout_plan_exercises for select to authenticated
using (exists (select 1 from public.workout_plans p where p.id = plan_id and (
  p.user_id = auth.uid() or p.visibility = 'public' or
  (p.visibility = 'followers' and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id))
)));
create policy "owners manage plan exercises" on public.workout_plan_exercises for all to authenticated
using (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid()));

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','open','active','completed','cancelled')),
  prize_amount numeric(12,2),
  prize_currency text not null default 'CZK' check (prize_currency in ('CZK','EUR','USD')),
  rules_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (prize_amount is null or prize_amount >= 0)
);
create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_id uuid references public.lifts(id) on delete set null,
  entered_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;
grant select on public.challenges, public.challenge_entries to authenticated;
grant insert on public.challenge_entries to authenticated;
create policy "published challenges readable" on public.challenges for select to authenticated using (status <> 'draft' or created_by = auth.uid());
create policy "challenge creator manages draft" on public.challenges for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "challenge entries readable" on public.challenge_entries for select to authenticated using (true);
create policy "users enter as themselves" on public.challenge_entries for insert to authenticated with check (user_id = auth.uid());

-- Prevent ordinary users from changing lift evidence, ownership or verification state after submission.
create or replace function public.protect_lift_verification_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or new.video_path is distinct from old.video_path
      or new.status is distinct from old.status then
      raise exception 'Submitted lift evidence and verification status cannot be changed directly';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_lift_verification_fields on public.lifts;
create trigger protect_lift_verification_fields before update on public.lifts
for each row execute function public.protect_lift_verification_fields();

create or replace function public.touch_workout_plan_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists t_workout_plans_updated_at on public.workout_plans;
create trigger t_workout_plans_updated_at before update on public.workout_plans
for each row execute function public.touch_workout_plan_updated_at();


-- ===== drizzle/migrations/0002_progress_battles_notifications.sql =====
-- REPUNIT progression, crew identity, battles, call-outs and notifications.
alter table public.crews add column if not exists accent_color text not null default '#ff303c';
alter table public.crews add column if not exists emblem text not null default '🏋️';
alter table public.crews add column if not exists total_xp bigint not null default 0;

create table if not exists public.user_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_on date,
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
grant select on public.user_progress to authenticated;
grant insert, update on public.user_progress to authenticated;
create policy "progress visible to signed in users" on public.user_progress for select to authenticated using (true);
create policy "users create own progress" on public.user_progress for insert to authenticated with check (user_id = auth.uid());
create policy "users update own progress" on public.user_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  earned_at timestamptz not null default now(),
  unique(user_id, achievement_key)
);
alter table public.user_achievements enable row level security;
grant select on public.user_achievements to authenticated;
create policy "achievements are public" on public.user_achievements for select to authenticated using (true);

create table if not exists public.crew_achievements (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  achievement_key text not null,
  awarded_at timestamptz not null default now(),
  unique(crew_id, achievement_key)
);
alter table public.crew_achievements enable row level security;
grant select on public.crew_achievements to authenticated;
create policy "crew achievements are visible" on public.crew_achievements for select to authenticated using (true);

create table if not exists public.crew_battles (
  id uuid primary key default gen_random_uuid(),
  challenger_crew_id uuid not null references public.crews(id) on delete cascade,
  opponent_crew_id uuid not null references public.crews(id) on delete cascade,
  category text not null check(category in ('bench','squat','deadlift','volume')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','active','completed','cancelled')),
  winner_crew_id uuid references public.crews(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(challenger_crew_id <> opponent_crew_id),
  check(ends_at > starts_at)
);
create index if not exists crew_battles_schedule_idx on public.crew_battles(status, starts_at, ends_at);
alter table public.crew_battles enable row level security;
grant select, insert on public.crew_battles to authenticated;
create policy "crew members read battles" on public.crew_battles for select to authenticated using (
 public.is_crew_member(challenger_crew_id,auth.uid()) or public.is_crew_member(opponent_crew_id,auth.uid())
);
create policy "crew owner starts battle" on public.crew_battles for insert to authenticated with check (
 created_by=auth.uid() and exists(select 1 from public.crews c where c.id=challenger_crew_id and c.owner_id=auth.uid())
);

create table if not exists public.lifter_challenges (
 id uuid primary key default gen_random_uuid(),
 challenger_id uuid not null references public.profiles(id) on delete cascade,
 challenged_id uuid not null references public.profiles(id) on delete cascade,
 exercise public.exercise not null,
 target_weight_kg numeric(6,2) not null check(target_weight_kg>0 and target_weight_kg<=600),
 status text not null default 'pending' check(status in ('pending','accepted','completed','failed','ignored','expired')),
 winner_id uuid references public.profiles(id) on delete set null,
 due_at timestamptz not null default (now()+interval '7 days'),
 created_at timestamptz not null default now(),
 check(challenger_id <> challenged_id)
);
alter table public.lifter_challenges enable row level security;
grant select, insert, update on public.lifter_challenges to authenticated;
create policy "participants read challenges" on public.lifter_challenges for select to authenticated using(challenger_id=auth.uid() or challenged_id=auth.uid());
create policy "users create challenges" on public.lifter_challenges for insert to authenticated with check(challenger_id=auth.uid());
create policy "challenged user responds" on public.lifter_challenges for update to authenticated using(challenged_id=auth.uid() or challenger_id=auth.uid()) with check(challenged_id=auth.uid() or challenger_id=auth.uid());

create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null,
 kind text not null check(kind in ('lift','pr','like','comment','challenge','rank','battle','streak','system')),
 title text not null check(char_length(title)<=120),
 body text not null check(char_length(body)<=500),
 href text,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
create policy "users read own notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
create policy "users mark own notifications" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.award_lift_xp()
returns trigger language plpgsql security definer set search_path=public as $$
declare today date := current_date; previous_day date; next_streak integer;
begin
 insert into public.user_progress(user_id,xp,current_streak,longest_streak,last_activity_on)
 values(new.user_id,25,1,1,today)
 on conflict(user_id) do update set
 xp=public.user_progress.xp+25,
 current_streak=case
  when public.user_progress.last_activity_on=today then public.user_progress.current_streak
  when public.user_progress.last_activity_on=today-1 then public.user_progress.current_streak+1
  else 1 end,
 longest_streak=greatest(public.user_progress.longest_streak,case
  when public.user_progress.last_activity_on=today then public.user_progress.current_streak
  when public.user_progress.last_activity_on=today-1 then public.user_progress.current_streak+1
  else 1 end),
 last_activity_on=greatest(coalesce(public.user_progress.last_activity_on,today),today),
 updated_at=now();
 insert into public.notifications(user_id,kind,title,body,href)
 values(new.user_id,'lift','Workout logged','You earned 25 XP for logging a lift.','/records/'||new.id::text);
 return new;
end $$;
drop trigger if exists lifts_award_xp on public.lifts;
create trigger lifts_award_xp after insert on public.lifts for each row execute function public.award_lift_xp();

-- Only verified lifts count toward public strength rankings.
create or replace function public.leaderboard(_exercise public.exercise, _crew uuid default null, _since date default null)
returns table(user_id uuid, username text, display_name text, avatar_url text, weight_kg numeric, reps int, status public.lift_status, lift_id uuid, lifted_on date)
language sql stable security definer set search_path=public as $$
 select * from (
  select distinct on(l.user_id) l.user_id,p.username,p.display_name,p.avatar_url,l.weight_kg,l.reps,l.status,l.id,l.lifted_on
  from public.lifts l join public.profiles p on p.id=l.user_id
  where l.exercise=_exercise and l.status='VERIFIED'
   and (_crew is null or exists(select 1 from public.crew_members m where m.crew_id=_crew and m.user_id=l.user_id))
   and (_since is null or l.lifted_on>=_since)
  order by l.user_id,l.weight_kg desc,l.reps desc,l.lifted_on asc
 ) ranked order by weight_kg desc,reps desc limit 100
$$;
grant execute on function public.leaderboard(public.exercise,uuid,date) to anon,authenticated;


-- ===== drizzle/migrations/0003_xp_achievements.sql =====
-- Additional REPUNIT progression rewards. Existing lift XP trigger remains the source of workout XP.
create or replace function public.award_streak_achievement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.current_streak >= 7 then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'streak_7') on conflict(user_id, achievement_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists progress_streak_achievement on public.user_progress;
create trigger progress_streak_achievement after insert or update of current_streak on public.user_progress
for each row execute function public.award_streak_achievement();

create or replace function public.award_lift_achievements()
returns trigger language plpgsql security definer set search_path=public as $$
declare total_volume numeric;
begin
  if new.status <> 'REJECTED' then
    insert into public.user_achievements(user_id, achievement_key)
    values(new.user_id, 'first_pr') on conflict(user_id, achievement_key) do nothing;
    if new.exercise = 'bench' and new.weight_kg >= 100 then
      insert into public.user_achievements(user_id, achievement_key)
      values(new.user_id, 'bench_100') on conflict(user_id, achievement_key) do nothing;
    end if;
    select coalesce(sum(weight_kg * reps),0) into total_volume from public.lifts
      where user_id = new.user_id and status <> 'REJECTED';
    if total_volume >= 1000 then
      insert into public.user_achievements(user_id, achievement_key)
      values(new.user_id, 'volume_1000') on conflict(user_id, achievement_key) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();

-- Give the author XP when another member likes one of their posts; duplicate likes cannot farm XP.
create or replace function public.award_like_xp()
returns trigger language plpgsql security definer set search_path=public as $$
declare post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(post_owner, 5, 0, 0, null)
    on conflict(user_id) do update set xp = public.user_progress.xp + 5, updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists likes_award_xp on public.likes;
create trigger likes_award_xp after insert on public.likes
for each row execute function public.award_like_xp();


-- ===== drizzle/migrations/0004_progression_security.sql =====
-- REPUNIT progression hardening.
-- XP and streak values must only be changed by trusted database triggers, never by clients.
revoke insert, update on public.user_progress from authenticated;
drop policy if exists "users create own progress" on public.user_progress;
drop policy if exists "users update own progress" on public.user_progress;

-- Award workout XP only after a lift is verified. Pending/rejected submissions earn nothing.
create or replace function public.award_lift_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

  insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
  values (new.user_id, 25, 1, 1, current_date)
  on conflict (user_id) do update set
    xp = public.user_progress.xp + 25,
    current_streak = case
      when public.user_progress.last_activity_on = current_date then public.user_progress.current_streak
      when public.user_progress.last_activity_on = current_date - 1 then public.user_progress.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      public.user_progress.longest_streak,
      case
        when public.user_progress.last_activity_on = current_date then public.user_progress.current_streak
        when public.user_progress.last_activity_on = current_date - 1 then public.user_progress.current_streak + 1
        else 1
      end
    ),
    last_activity_on = greatest(coalesce(public.user_progress.last_activity_on, current_date), current_date),
    updated_at = now();

  insert into public.notifications(user_id, kind, title, body, href)
  values (new.user_id, 'lift', 'Lift verified', 'Your lift was verified. You earned 25 XP.', '/records/' || new.id::text);

  return new;
end;
$$;

drop trigger if exists lifts_award_xp on public.lifts;
create trigger lifts_award_xp
after insert or update of status on public.lifts
for each row execute function public.award_lift_xp();

-- Award First PR only on the user's first verified lift in an exercise, not on a pending submission.
create or replace function public.award_lift_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_volume numeric;
  previous_best numeric;
begin
  if new.status <> 'VERIFIED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then
    return new;
  end if;

  select max(weight_kg) into previous_best
  from public.lifts
  where user_id = new.user_id
    and exercise = new.exercise
    and status = 'VERIFIED'
    and id <> new.id;

  if previous_best is null or new.weight_kg > previous_best then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'first_pr')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  if new.exercise = 'bench' and new.weight_kg >= 100 then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'bench_100')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  select coalesce(sum(weight_kg * reps), 0) into total_volume
  from public.lifts
  where user_id = new.user_id and status = 'VERIFIED';

  if total_volume >= 1000 then
    insert into public.user_achievements(user_id, achievement_key)
    values (new.user_id, 'volume_1000')
    on conflict (user_id, achievement_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();


-- ===== drizzle/migrations/0005_workout_days.sql =====
-- Add a weekday to each workout plan.
alter table public.workout_plans
  add column if not exists workout_day text not null default 'Monday'
  check (workout_day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));

create index if not exists workout_plans_user_day_idx
  on public.workout_plans(user_id, workout_day);


-- ===== drizzle/migrations/0006_expanded_achievements.sql =====
-- REPUNIT: expanded achievement engine (140+ lifetime achievements).
-- Enable live client notifications for newly unlocked achievements when Supabase Realtime is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_achievements') then
    alter publication supabase_realtime add table public.user_achievements;
  end if; 
end $$;
-- All criteria use verified lifts only. Each unlock is unique and awards 10 bonus XP.
create or replace function public.award_lift_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_volume numeric;
  total_sessions integer;
  total_reps bigint;
  exercise_count integer;
  training_days integer;
  best_weight numeric;
  streak integer;
  achievement_key text;
  threshold integer;
  earned boolean;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  select count(*), coalesce(sum(weight_kg * reps),0), coalesce(sum(reps),0), count(distinct exercise), count(distinct lifted_on)
    into total_sessions,total_volume,total_reps,exercise_count,training_days
  from public.lifts where user_id=new.user_id and status='VERIFIED';

  select coalesce(current_streak,0) into streak from public.user_progress where user_id=new.user_id;
  streak := coalesce(streak,0);

  foreach achievement_key in array array[
    'first_pr',
    'bench_100',
    'volume_1000',
    'sessions_1',
    'sessions_2',
    'sessions_3',
    'sessions_4',
    'sessions_5',
    'sessions_6',
    'sessions_7',
    'sessions_8',
    'sessions_9',
    'sessions_10',
    'sessions_11',
    'sessions_12',
    'sessions_13',
    'sessions_14',
    'sessions_15',
    'sessions_16',
    'sessions_17',
    'sessions_18',
    'sessions_19',
    'sessions_20',
    'sessions_21',
    'sessions_22',
    'sessions_23',
    'sessions_24',
    'sessions_25',
    'sessions_26',
    'sessions_27',
    'sessions_28',
    'sessions_29',
    'sessions_30',
    'sessions_31',
    'sessions_32',
    'sessions_33',
    'sessions_34',
    'sessions_35',
    'sessions_36',
    'sessions_37',
    'sessions_38',
    'sessions_39',
    'sessions_40',
    'sessions_41',
    'sessions_42',
    'sessions_43',
    'sessions_44',
    'sessions_45',
    'sessions_46',
    'sessions_47',
    'sessions_48',
    'sessions_49',
    'sessions_50',
    'volume_2500',
    'volume_5000',
    'volume_10000',
    'volume_25000',
    'volume_50000',
    'volume_75000',
    'volume_100000',
    'volume_150000',
    'volume_200000',
    'volume_300000',
    'volume_400000',
    'volume_500000',
    'volume_650000',
    'volume_800000',
    'volume_1000000',
    'volume_1500000',
    'volume_2000000',
    'volume_3000000',
    'volume_5000000',
    'streak_14',
    'streak_30',
    'streak_60',
    'streak_100',
    'streak_180',
    'streak_365',
    'bench_40',
    'bench_60',
    'bench_80',
    'bench_120',
    'bench_140',
    'bench_160',
    'bench_180',
    'bench_200',
    'bench_220',
    'bench_240',
    'bench_260',
    'bench_280',
    'bench_300',
    'squat_40',
    'squat_60',
    'squat_80',
    'squat_100',
    'squat_120',
    'squat_140',
    'squat_160',
    'squat_180',
    'squat_200',
    'squat_220',
    'squat_240',
    'squat_260',
    'squat_280',
    'squat_300',
    'deadlift_40',
    'deadlift_60',
    'deadlift_80',
    'deadlift_100',
    'deadlift_120',
    'deadlift_140',
    'deadlift_160',
    'deadlift_180',
    'deadlift_200',
    'deadlift_220',
    'deadlift_240',
    'deadlift_260',
    'deadlift_280',
    'deadlift_300',
    'days_3',
    'days_7',
    'days_14',
    'days_30',
    'days_60',
    'days_100',
    'days_200',
    'days_365',
    'days_500',
    'days_1000',
    'reps_100',
    'reps_250',
    'reps_500',
    'reps_1000',
    'reps_2500',
    'reps_5000',
    'reps_10000',
    'reps_25000',
    'reps_50000',
    'reps_100000'
  ] loop
    earned := false;
    if achievement_key = 'first_pr' then
      earned := not exists(select 1 from public.user_achievements where user_id=new.user_id and achievement_key='first_pr')
        and (select count(*) from public.lifts where user_id=new.user_id and exercise=new.exercise and status='VERIFIED') >= 1;
    elsif achievement_key = 'bench_100' then
      earned := new.exercise='bench' and new.weight_kg >= 100;
    elsif achievement_key like 'sessions_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_sessions >= threshold;
    elsif achievement_key like 'volume_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_volume >= threshold;
    elsif achievement_key like 'streak_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := streak >= threshold;
    elsif achievement_key like 'days_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := training_days >= threshold;
    elsif achievement_key like 'reps_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_reps >= threshold;
    elsif achievement_key like 'bench_%' or achievement_key like 'squat_%' or achievement_key like 'deadlift_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := new.exercise::text=split_part(achievement_key,'_',1)
        and new.weight_kg >= threshold;
    end if;

    if earned then
      insert into public.user_achievements(user_id,achievement_key)
      values(new.user_id,achievement_key)
      on conflict(user_id,achievement_key) do nothing;
      if found then
        insert into public.user_progress(user_id,xp,current_streak,longest_streak,last_activity_on)
        values(new.user_id,10,0,0,null)
        on conflict(user_id) do update set xp=public.user_progress.xp+10,updated_at=now();
        insert into public.notifications(user_id,kind,title,body,href)
        values(new.user_id,'rank','Achievement unlocked','You unlocked '||replace(achievement_key,'_',' ')||' · +10 XP','/leaderboards');
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();


-- ===== drizzle/migrations/0008_weekly_crew_battles.sql =====
-- REPUNIT weekly crew battles: rotating weekly matchups, direct challenges and secure responses.
alter table public.crew_battles
  add column if not exists is_weekly boolean not null default false,
  add column if not exists week_start date;

alter table public.crew_battles drop constraint if exists crew_battles_status_check;
alter table public.crew_battles add constraint crew_battles_status_check
  check (status in ('pending','scheduled','active','completed','cancelled'));

create index if not exists crew_battles_challenger_idx on public.crew_battles(challenger_crew_id, starts_at desc);
create index if not exists crew_battles_opponent_idx on public.crew_battles(opponent_crew_id, starts_at desc);
create unique index if not exists crew_battles_weekly_pair_idx
  on public.crew_battles(week_start, challenger_crew_id, opponent_crew_id)
  where is_weekly = true;

-- A member of a crew can ask the database to create this week's pairings.
-- Pairing is generated once per week under an advisory lock, so repeated visits
-- cannot create duplicate weekly matchups.
create or replace function public.ensure_weekly_crew_battles(_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  monday date := date_trunc('week', now())::date;
  battle_category text;
begin
  if auth.uid() is null or not public.is_crew_member(_crew, auth.uid()) then
    raise exception 'Join this crew to view its battles';
  end if;

  perform pg_advisory_xact_lock(hashtext('repunit-weekly-crew-battles'));
  if exists(select 1 from public.crew_battles where is_weekly = true and week_start = monday) then
    return;
  end if;

  battle_category := case (extract(week from monday)::integer - 1) % 3
    when 0 then 'bench' when 1 then 'squat' else 'deadlift' end;

  with eligible as (
    select c.id, row_number() over(order by random()) as rn
    from public.crews c
    where (select count(*) from public.crew_members cm where cm.crew_id=c.id) >= 2
  ), pairs as (
    select a.id as left_id, b.id as right_id
    from eligible a join eligible b on b.rn = a.rn + 1
    where mod(a.rn, 2) = 1
  )
  insert into public.crew_battles(
    challenger_crew_id, opponent_crew_id, category, starts_at, ends_at,
    status, created_by, is_weekly, week_start
  )
  select p.left_id, p.right_id, battle_category,
    monday::timestamptz, (monday + 7)::timestamptz,
    'scheduled', auth.uid(), true, monday
  from pairs p
  where not exists (
    select 1 from public.crew_battles b
    where b.is_weekly = true and b.week_start = monday
      and (b.challenger_crew_id in (p.left_id,p.right_id)
        or b.opponent_crew_id in (p.left_id,p.right_id))
  );
end $$;
grant execute on function public.ensure_weekly_crew_battles(uuid) to authenticated;

create or replace function public.challenge_crew(_challenger uuid, _opponent uuid, _category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare battle_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to challenge a crew'; end if;
  if _challenger = _opponent then raise exception 'Choose a different crew'; end if;
  if _category not in ('bench','squat','deadlift') then raise exception 'Invalid battle category'; end if;
  if not exists(select 1 from public.crew_members where crew_id=_challenger and user_id=auth.uid() and role='admin') then
    raise exception 'Only your crew admins can send challenges';
  end if;
  if not exists(select 1 from public.crews where id=_opponent) then raise exception 'Crew not found'; end if;
  insert into public.crew_battles(
    challenger_crew_id, opponent_crew_id, category, starts_at, ends_at,
    status, created_by, is_weekly
  ) values (_challenger,_opponent,_category,date_trunc('day',now()),date_trunc('day',now())+interval '7 days','pending',auth.uid(),false)
  returning id into battle_id;
  return battle_id;
end $$;
grant execute on function public.challenge_crew(uuid,uuid,text) to authenticated;

create or replace function public.respond_crew_battle(_battle uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare opponent uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to respond'; end if;
  select opponent_crew_id into opponent from public.crew_battles
    where id=_battle and status='pending' for update;
  if opponent is null then raise exception 'This challenge is no longer waiting for a response'; end if;
  if not exists(select 1 from public.crew_members where crew_id=opponent and user_id=auth.uid() and role='admin') then
    raise exception 'Only the challenged crew admins can respond';
  end if;
  if _accept then
    update public.crew_battles set status='active', starts_at=date_trunc('day',now()), ends_at=date_trunc('day',now())+interval '7 days' where id=_battle;
  else
    update public.crew_battles set status='cancelled' where id=_battle;
  end if;
end $$;
grant execute on function public.respond_crew_battle(uuid,boolean) to authenticated;


-- Finalize an expired battle exactly once and award the winning crew its badge.
create or replace function public.complete_crew_battle(_battle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  left_total numeric := 0;
  right_total numeric := 0;
  winner uuid;
begin
  select * into b from public.crew_battles where id=_battle for update;
  if not found then raise exception 'Battle not found'; end if;
  if auth.uid() is null or not (
    public.is_crew_member(b.challenger_crew_id,auth.uid())
    or public.is_crew_member(b.opponent_crew_id,auth.uid())
  ) then raise exception 'Join one of the crews to finalize this battle'; end if;
  if b.status in ('completed','cancelled','pending') or now()<b.ends_at then return; end if;

  select coalesce(sum(best_weight),0) into left_total from (
    select max(l.weight_kg) as best_weight
    from public.lifts l join public.crew_members cm on cm.user_id=l.user_id
    where cm.crew_id=b.challenger_crew_id and l.exercise::text=b.category
      and l.status='VERIFIED' and l.lifted_on>=b.starts_at::date and l.lifted_on<b.ends_at::date
    group by l.user_id
  ) scores;
  select coalesce(sum(best_weight),0) into right_total from (
    select max(l.weight_kg) as best_weight
    from public.lifts l join public.crew_members cm on cm.user_id=l.user_id
    where cm.crew_id=b.opponent_crew_id and l.exercise::text=b.category
      and l.status='VERIFIED' and l.lifted_on>=b.starts_at::date and l.lifted_on<b.ends_at::date
    group by l.user_id
  ) scores;
  if left_total>right_total then winner:=b.challenger_crew_id;
  elsif right_total>left_total then winner:=b.opponent_crew_id;
  else winner:=null; end if;

  update public.crew_battles set status='completed',winner_crew_id=winner where id=_battle;
  if winner is not null then
    insert into public.crew_achievements(crew_id,achievement_key)
    values(winner,'crew_battle_winner:'||_battle::text)
    on conflict(crew_id,achievement_key) do nothing;
  end if;
end $$;
grant execute on function public.complete_crew_battle(uuid) to authenticated;


-- ===== drizzle/migrations/0009_crew_rankings_country.sql =====
-- Country support for regional crew rankings.
alter table public.profiles add column if not exists country_code char(2);
create index if not exists profiles_country_code_idx on public.profiles(country_code);


-- ===== drizzle/migrations/0010_public_crews.sql =====
-- Public crew discovery and safe joining from crew profile pages.
alter table public.crews add column if not exists is_public boolean not null default false;
grant select (is_public) on public.crews to authenticated;

create or replace function public.set_crew_visibility(_crew uuid, _public boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.crew_members
    where crew_id=_crew and user_id=auth.uid() and role='admin'
  ) then raise exception 'Only crew admins can change visibility'; end if;
  update public.crews set is_public=_public where id=_crew;
end $$;
grant execute on function public.set_crew_visibility(uuid,boolean) to authenticated;

create or replace function public.join_public_crew(_crew uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare cap integer; current_count integer; is_open boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join a crew'; end if;
  select max_members,is_public into cap,is_open from public.crews where id=_crew for update;
  if cap is null then raise exception 'Crew not found'; end if;
  if not is_open then raise exception 'This crew is private'; end if;
  if exists(select 1 from public.crew_members where crew_id=_crew and user_id=auth.uid()) then return _crew; end if;
  select count(*) into current_count from public.crew_members where crew_id=_crew;
  if current_count>=cap then raise exception 'This crew is full'; end if;
  insert into public.crew_members(crew_id,user_id,role) values(_crew,auth.uid(),'member');
  return _crew;
end $$;
grant execute on function public.join_public_crew(uuid) to authenticated;


commit;
