-- REPUNIT 0013: repair crew battles on existing Supabase projects.
-- Safe to run repeatedly in Supabase SQL Editor.

create table if not exists public.crew_battles (
  id uuid primary key default gen_random_uuid(),
  challenger_crew_id uuid not null references public.crews(id) on delete cascade,
  opponent_crew_id uuid not null references public.crews(id) on delete cascade,
  category text not null check (category in ('bench','squat','deadlift','volume')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  winner_crew_id uuid references public.crews(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  is_weekly boolean not null default false,
  week_start date,
  constraint crew_battles_different_crews check (challenger_crew_id <> opponent_crew_id),
  constraint crew_battles_valid_dates check (ends_at > starts_at)
);

alter table public.crew_battles
  add column if not exists is_weekly boolean not null default false,
  add column if not exists week_start date;

alter table public.crew_battles drop constraint if exists crew_battles_category_check;
alter table public.crew_battles add constraint crew_battles_category_check
  check (category in ('bench','squat','deadlift','volume'));

alter table public.crew_battles drop constraint if exists crew_battles_status_check;
alter table public.crew_battles add constraint crew_battles_status_check
  check (status in ('pending','scheduled','active','completed','cancelled'));

create index if not exists crew_battles_schedule_idx on public.crew_battles(status, starts_at, ends_at);
create index if not exists crew_battles_challenger_idx on public.crew_battles(challenger_crew_id, starts_at desc);
create index if not exists crew_battles_opponent_idx on public.crew_battles(opponent_crew_id, starts_at desc);
create unique index if not exists crew_battles_weekly_pair_idx
  on public.crew_battles(week_start, challenger_crew_id, opponent_crew_id)
  where is_weekly = true;

alter table public.crew_battles enable row level security;
grant select on public.crew_battles to authenticated;

drop policy if exists "crew members read battles" on public.crew_battles;
create policy "crew members read battles" on public.crew_battles for select to authenticated
using (
  public.is_crew_member(challenger_crew_id, auth.uid())
  or public.is_crew_member(opponent_crew_id, auth.uid())
);

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
  -- Promote scheduled weekly matchups as soon as a crew member opens the battle area.
  update public.crew_battles
    set status = 'active'
    where is_weekly = true and status = 'scheduled'
      and starts_at <= now() and ends_at > now();
  if exists(select 1 from public.crew_battles where is_weekly = true and week_start = monday) then
    return;
  end if;
  battle_category := case (extract(week from monday)::integer - 1) % 4
    when 0 then 'bench' when 1 then 'squat' when 2 then 'deadlift' else 'volume' end;
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
  if _category not in ('bench','squat','deadlift','volume') then raise exception 'Invalid battle category'; end if;
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
  select coalesce(sum(member_score),0) into left_total from (
    select case when b.category='volume'
      then sum(l.weight_kg * coalesce(l.reps,1))
      else max(l.weight_kg) end as member_score
    from public.lifts l join public.crew_members cm on cm.user_id=l.user_id
    where cm.crew_id=b.challenger_crew_id
      and (b.category='volume' or l.exercise::text=b.category)
      and l.status='VERIFIED'
      and l.lifted_on>=b.starts_at::date and l.lifted_on<b.ends_at::date
    group by l.user_id
  ) scores;
  select coalesce(sum(member_score),0) into right_total from (
    select case when b.category='volume'
      then sum(l.weight_kg * coalesce(l.reps,1))
      else max(l.weight_kg) end as member_score
    from public.lifts l join public.crew_members cm on cm.user_id=l.user_id
    where cm.crew_id=b.opponent_crew_id
      and (b.category='volume' or l.exercise::text=b.category)
      and l.status='VERIFIED'
      and l.lifted_on>=b.starts_at::date and l.lifted_on<b.ends_at::date
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

notify pgrst, 'reload schema';
