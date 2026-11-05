-- REPUNIT 0017: lifter leaderboard scopes and bodyweight classes.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

alter table public.profiles
  add column if not exists bodyweight_kg numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_bodyweight_kg_range'
  ) then
    alter table public.profiles
      add constraint profiles_bodyweight_kg_range
      check (bodyweight_kg is null or bodyweight_kg between 25 and 350);
  end if;
end;
$$;

create or replace function public.leaderboard_scoped(
  _exercise public.exercise,
  _crew uuid default null,
  _since date default null,
  _user_ids uuid[] default null,
  _weight_class text default null
)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bodyweight_kg numeric,
  weight_kg numeric,
  reps integer,
  status public.lift_status,
  lift_id uuid,
  lifted_on date,
  rank_position bigint
)
language sql stable security definer set search_path = public as $$
  with best_lifts as (
    select distinct on (l.user_id)
      l.user_id, p.username, p.display_name, p.avatar_url, p.bodyweight_kg,
      l.weight_kg, l.reps, l.status, l.id as lift_id, l.lifted_on
    from public.lifts l
    join public.profiles p on p.id = l.user_id
    where l.exercise = _exercise
      and l.status = 'VERIFIED'
      and (_crew is null or exists (
        select 1 from public.crew_members m
        where m.crew_id = _crew and m.user_id = l.user_id
      ))
      and (_since is null or l.lifted_on >= _since)
      and (_user_ids is null or l.user_id = any(_user_ids))
      and (
        _weight_class is null
        or case
          when p.bodyweight_kg is null then 'unclassified'
          when p.bodyweight_kg < 60 then 'u60'
          when p.bodyweight_kg < 75 then '60_75'
          when p.bodyweight_kg < 90 then '75_90'
          when p.bodyweight_kg < 105 then '90_105'
          else '105_plus'
        end = _weight_class
      )
    order by l.user_id, l.weight_kg desc, l.reps desc, l.lifted_on asc
  ), ranked as (
    select row_number() over(order by b.weight_kg desc, b.reps desc, b.lifted_on asc, b.username asc) as rank_position,
           b.*
    from best_lifts b
  )
  select ranked.user_id, ranked.username, ranked.display_name, ranked.avatar_url,
         ranked.bodyweight_kg, ranked.weight_kg, ranked.reps, ranked.status,
         ranked.lift_id, ranked.lifted_on, ranked.rank_position
  from ranked
  where ranked.rank_position <= 100 or ranked.user_id = auth.uid()
  order by ranked.rank_position;
$$;

grant execute on function public.leaderboard_scoped(public.exercise, uuid, date, uuid[], text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
