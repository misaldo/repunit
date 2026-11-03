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
