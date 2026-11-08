-- REPUNIT 0045: weekend events, actionable rivalries and achievement cosmetics.
-- Safe to apply once in Supabase SQL Editor; all writes are guarded server-side.

begin;

-- 5. Admin-created events and verified-lift participation.
create table if not exists public.repunit_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exercise public.exercise,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists repunit_events_window_idx on public.repunit_events(starts_at, ends_at);
alter table public.repunit_events enable row level security;
revoke all on public.repunit_events from anon, authenticated;
grant select on public.repunit_events to authenticated;
drop policy if exists "authenticated read events" on public.repunit_events;
create policy "authenticated read events" on public.repunit_events for select to authenticated using (true);

create table if not exists public.repunit_event_entries (
  event_id uuid not null references public.repunit_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_count integer not null default 0,
  best_kg numeric(7,2) not null default 0,
  volume_kg numeric(12,2) not null default 0,
  first_participated_at timestamptz not null default now(),
  primary key(event_id, user_id)
);
alter table public.repunit_event_entries enable row level security;
revoke all on public.repunit_event_entries from anon, authenticated;
grant select on public.repunit_event_entries to authenticated;
drop policy if exists "authenticated read event entries" on public.repunit_event_entries;
create policy "authenticated read event entries" on public.repunit_event_entries for select to authenticated using (true);

create or replace function public.admin_create_repunit_event(
  _title text, _description text, _starts_at timestamptz, _ends_at timestamptz, _exercise public.exercise default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare event_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can create REPUNIT events' using errcode='42501';
  end if;
  if _starts_at is null or _ends_at is null or _ends_at <= _starts_at then
    raise exception 'Event end must be after its start' using errcode='22023';
  end if;
  insert into public.repunit_events(title,description,starts_at,ends_at,exercise,created_by)
  values (left(btrim(_title),80),left(coalesce(_description,''),500),_starts_at,_ends_at,_exercise,auth.uid())
  returning id into event_id;
  return event_id;
end $$;
revoke all on function public.admin_create_repunit_event(text,text,timestamptz,timestamptz,public.exercise) from public, anon;
grant execute on function public.admin_create_repunit_event(text,text,timestamptz,timestamptz,public.exercise) to authenticated;

create or replace function public.repunit_record_event_lift()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;
  insert into public.repunit_event_entries(event_id,user_id,lift_count,best_kg,volume_kg)
  select e.id,new.user_id,1,new.weight_kg,new.weight_kg * new.reps
  from public.repunit_events e
  where new.created_at >= e.starts_at and new.created_at <= e.ends_at
    and (e.exercise is null or e.exercise = new.exercise)
  on conflict(event_id,user_id) do update set
    lift_count = public.repunit_event_entries.lift_count + 1,
    best_kg = greatest(public.repunit_event_entries.best_kg, excluded.best_kg),
    volume_kg = public.repunit_event_entries.volume_kg + excluded.volume_kg;
  return new;
end $$;
drop trigger if exists lifts_record_repunit_event on public.lifts;
create trigger lifts_record_repunit_event after insert or update of status on public.lifts
for each row execute function public.repunit_record_event_lift();

create or replace function public.repunit_event_leaderboard(_event_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, lift_count integer, best_kg numeric, volume_kg numeric, rank_position bigint)
language sql stable security definer set search_path=public as $$
  select p.id,p.username,p.display_name,p.avatar_url,e.lift_count,e.best_kg,e.volume_kg,
    row_number() over (order by
      case when v.exercise is null then e.volume_kg else e.best_kg end desc,
      e.lift_count desc,e.first_participated_at asc
    ) as rank_position
  from public.repunit_event_entries e
  join public.profiles p on p.id=e.user_id
  join public.repunit_events v on v.id=e.event_id
  where e.event_id=_event_id
  order by rank_position
  limit 100
$$;
revoke all on function public.repunit_event_leaderboard(uuid) from public, anon;
grant execute on function public.repunit_event_leaderboard(uuid) to authenticated;

-- 6. Notify Crew rivals when a verified lift overtakes their previous best.
create or replace function public.repunit_notify_crew_rivalry()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  rival record;
  actor_name text;
  gap numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;
  select coalesce(display_name,username) into actor_name from public.profiles where id=new.user_id;
  for rival in
    select distinct m.user_id, coalesce(p.display_name,p.username) as rival_name,
      max(l.weight_kg) as old_best
    from public.crew_members mine
    join public.crew_members m on m.crew_id=mine.crew_id and m.user_id<>new.user_id
    join public.profiles p on p.id=m.user_id
    left join public.lifts l on l.user_id=m.user_id and l.exercise=new.exercise and l.status='VERIFIED'
    where mine.user_id=new.user_id
    group by m.user_id,p.display_name,p.username
    having max(l.weight_kg) is not null and max(l.weight_kg) < new.weight_kg
  loop
    gap := new.weight_kg-rival.old_best;
    perform public.repunit_create_notification(
      rival.user_id,new.user_id,'challenge','You were passed by '||coalesce(actor_name,'A rival'),
      coalesce(actor_name,'A rival')||' passed your '||new.exercise::text||' best by '||gap::text||' kg. Challenge back.',
      '/leaderboards'
    );
  end loop;
  return new;
end $$;
drop trigger if exists lifts_notify_crew_rivalry on public.lifts;
create trigger lifts_notify_crew_rivalry after insert or update of status on public.lifts
for each row execute function public.repunit_notify_crew_rivalry();

create table if not exists public.repunit_rivalry_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  rival_id uuid not null references public.profiles(id) on delete cascade,
  exercise public.exercise not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check(status in ('open','accepted','completed','cancelled')),
  check(challenger_id <> rival_id)
);
alter table public.repunit_rivalry_challenges enable row level security;
revoke all on public.repunit_rivalry_challenges from anon, authenticated;
grant select on public.repunit_rivalry_challenges to authenticated;
drop policy if exists "users read own rivalry challenges" on public.repunit_rivalry_challenges;
create policy "users read own rivalry challenges" on public.repunit_rivalry_challenges for select to authenticated
using (challenger_id=auth.uid() or rival_id=auth.uid());

create or replace function public.repunit_challenge_back(_rival_id uuid, _exercise public.exercise)
returns uuid language plpgsql security definer set search_path=public as $$
declare challenge_id uuid; actor_name text;
begin
  if auth.uid() is null or _rival_id=auth.uid() then raise exception 'Invalid rival' using errcode='42501'; end if;
  if not exists (
    select 1 from public.crew_members a join public.crew_members b on a.crew_id=b.crew_id
    where a.user_id=auth.uid() and b.user_id=_rival_id
  ) then raise exception 'You must share a Crew to challenge this rival' using errcode='42501'; end if;
  insert into public.repunit_rivalry_challenges(challenger_id,rival_id,exercise)
  values(auth.uid(),_rival_id,_exercise) returning id into challenge_id;
  select coalesce(display_name,username) into actor_name from public.profiles where id=auth.uid();
  perform public.repunit_create_notification(_rival_id,auth.uid(),'challenge','Rivalry accepted',
    coalesce(actor_name,'A lifter')||' challenged you back in '||_exercise::text||'.','/leaderboards');
  return challenge_id;
end $$;
revoke all on function public.repunit_challenge_back(uuid,public.exercise) from public, anon;
grant execute on function public.repunit_challenge_back(uuid,public.exercise) to authenticated;

-- 7. Achievement cosmetics: frames, name colors and titles.
alter table public.profiles
  add column if not exists equipped_frame text,
  add column if not exists equipped_name_color text,
  add column if not exists equipped_title text;

create table if not exists public.repunit_cosmetics (
  cosmetic_key text primary key,
  cosmetic_type text not null check(cosmetic_type in ('frame','name_color','title')),
  label text not null,
  value text not null,
  achievement_key text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.repunit_user_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_key text not null references public.repunit_cosmetics(cosmetic_key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key(user_id,cosmetic_key)
);
alter table public.repunit_cosmetics enable row level security;
alter table public.repunit_user_cosmetics enable row level security;
revoke all on public.repunit_cosmetics,public.repunit_user_cosmetics from anon,authenticated;
grant select on public.repunit_cosmetics,public.repunit_user_cosmetics to authenticated;
drop policy if exists "authenticated read cosmetics catalog" on public.repunit_cosmetics;
create policy "authenticated read cosmetics catalog" on public.repunit_cosmetics for select to authenticated using(true);
drop policy if exists "users read own cosmetics" on public.repunit_user_cosmetics;
create policy "authenticated read public cosmetic unlocks" on public.repunit_user_cosmetics for select to authenticated using(true);

insert into public.repunit_cosmetics(cosmetic_key,cosmetic_type,label,value,achievement_key) values
 ('frame_iron','frame','Iron Frame','border-primary/70 ring-2 ring-primary/40','bench_100'),
 ('frame_streak','frame','Flame Frame','border-orange-500/70 ring-2 ring-orange-500/30','streak_7'),
 ('name_crimson','name_color','Crimson Name','text-red-500','pr_duo'),
 ('name_gold','name_color','Gold Name','text-amber-400','volume_1000'),
 ('title_record_breaker','title','Record Breaker','Record Breaker','pr_duo'),
 ('title_iron_lifter','title','Iron Lifter','Iron Lifter','bench_100'),
 ('title_consistent','title','Unbreakable','Unbreakable','streak_7')
on conflict(cosmetic_key) do nothing;

create or replace function public.repunit_grant_achievement_cosmetics()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.repunit_user_cosmetics(user_id,cosmetic_key)
  select new.user_id,c.cosmetic_key from public.repunit_cosmetics c
  where c.achievement_key=new.achievement_key
  on conflict(user_id,cosmetic_key) do nothing;
  return new;
end $$;
drop trigger if exists user_achievement_grant_cosmetics on public.user_achievements;
create trigger user_achievement_grant_cosmetics after insert on public.user_achievements
for each row execute function public.repunit_grant_achievement_cosmetics();
insert into public.repunit_user_cosmetics(user_id,cosmetic_key)
select a.user_id,c.cosmetic_key from public.user_achievements a
join public.repunit_cosmetics c on c.achievement_key=a.achievement_key
on conflict(user_id,cosmetic_key) do nothing;

create or replace function public.repunit_equip_cosmetic(_cosmetic_key text)
returns void language plpgsql security definer set search_path=public as $$
declare item public.repunit_cosmetics;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select c.* into item from public.repunit_cosmetics c
  join public.repunit_user_cosmetics u on u.cosmetic_key=c.cosmetic_key
  where c.cosmetic_key=_cosmetic_key and u.user_id=auth.uid();
  if item.cosmetic_key is null then raise exception 'Cosmetic is not unlocked' using errcode='42501'; end if;
  if item.cosmetic_type='frame' then update public.profiles set equipped_frame=item.value where id=auth.uid();
  elsif item.cosmetic_type='name_color' then update public.profiles set equipped_name_color=item.value where id=auth.uid();
  elsif item.cosmetic_type='title' then update public.profiles set equipped_title=item.value where id=auth.uid();
  end if;
end $$;
revoke all on function public.repunit_equip_cosmetic(text) from public,anon;
grant execute on function public.repunit_equip_cosmetic(text) to authenticated;

commit;
notify pgrst,'reload schema';
