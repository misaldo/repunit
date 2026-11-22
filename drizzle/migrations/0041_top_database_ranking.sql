-- REPUNIT 0041: database-backed TOP rankings.
-- Week/month boundaries are UTC. The existing lift rule is preserved:
-- highest weight, then reps, then earliest lifted_on, then stable user UUID.
-- Total requires a verified best Bench, Squat AND Deadlift.
-- Gym rankings are intentionally omitted until a gyms table/profile gym exists.

begin;

alter table public.profiles
  add column if not exists top_opt_out boolean not null default false;

create index if not exists lifts_verified_exercise_date_rank_idx
  on public.lifts (exercise, lifted_on, weight_kg desc, reps desc, user_id)
  where status = 'VERIFIED';

create index if not exists lifts_verified_user_exercise_rank_idx
  on public.lifts (user_id, exercise, weight_kg desc, reps desc, lifted_on asc)
  where status = 'VERIFIED';

create index if not exists profiles_country_top_idx
  on public.profiles (country_code, id)
  where top_opt_out = false;

create or replace function public.get_top_lifters(
  _lift text,
  _period text default 'all',
  _scope text default 'global',
  _limit integer default 50,
  _cursor jsonb default null
)
returns table (
  rank_position bigint,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  weight_kg numeric,
  reps integer,
  lift_id uuid,
  lifted_on date,
  has_video boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  period_start date;
  my_country char(2);
  my_crew_ids uuid[];
begin
  if _lift not in ('bench','squat','deadlift','total') then
    raise exception 'Invalid lift category';
  end if;
  if _period not in ('week','month','all') then
    raise exception 'Invalid period';
  end if;
  if _scope not in ('global','country','crew') then
    raise exception 'Invalid scope';
  end if;
  if auth.uid() is null and _scope <> 'global' then
    raise exception 'Sign in to use this ranking scope';
  end if;
  if _scope = 'country' then
    select p.country_code into my_country from public.profiles p where p.id = auth.uid();
    if my_country is null then return; end if;
  end if;
  if _scope = 'crew' then
    select coalesce(array_agg(cm.crew_id), array[]::uuid[])
      into my_crew_ids from public.crew_members cm where cm.user_id = auth.uid();
    if cardinality(my_crew_ids) = 0 then return; end if;
  end if;
  period_start := case
    when _period = 'week' then date_trunc('week', now() at time zone 'UTC')::date
    when _period = 'month' then date_trunc('month', now() at time zone 'UTC')::date
    else null
  end;

  return query
  with eligible as (
    select l.user_id, l.exercise::text as exercise, l.weight_kg, l.reps,
      l.id as lift_id, l.lifted_on, (l.video_path is not null) as has_video
    from public.lifts l
    where l.status = 'VERIFIED'
      and l.exercise::text in ('bench','squat','deadlift')
      and (period_start is null or l.lifted_on >= period_start)
  ), best as (
    select distinct on (e.user_id, e.exercise)
      e.user_id, e.exercise, e.weight_kg, e.reps, e.lift_id, e.lifted_on, e.has_video
    from eligible e
    order by e.user_id, e.exercise, e.weight_kg desc, e.reps desc, e.lifted_on asc, e.lift_id asc
  ), values_by_user as (
    select b.user_id,
      case when _lift = 'total' then sum(b.weight_kg) else max(b.weight_kg) end as score,
      case when _lift = 'total' then sum(b.reps)::integer
           else (array_agg(b.reps order by b.weight_kg desc, b.reps desc, b.lifted_on asc))[1] end as score_reps,
      case when _lift = 'total' then max(b.lifted_on)
           else (array_agg(b.lifted_on order by b.weight_kg desc, b.reps desc, b.lifted_on asc))[1] end as achieved_on,
      case when _lift = 'total' then null::uuid
           else (array_agg(b.lift_id order by b.weight_kg desc, b.reps desc, b.lifted_on asc))[1] end as selected_lift_id,
      bool_or(b.has_video) as any_video,
      count(*) as lift_count
    from best b
    where (_lift = 'total' or b.exercise = _lift)
    group by b.user_id
    having (_lift <> 'total' or count(*) = 3)
  ), ranked as (
    select row_number() over(order by v.score desc, v.score_reps desc, v.achieved_on asc, v.user_id asc) as position,
      v.*
    from values_by_user v
    join public.profiles p on p.id = v.user_id
    where (_scope = 'global' and not p.top_opt_out)
       or (_scope = 'country' and not p.top_opt_out and p.country_code = my_country)
       or (_scope = 'crew' and exists (
         select 1 from public.crew_members cm
         where cm.user_id = v.user_id and cm.crew_id = any(my_crew_ids)
       ))
  )
  select r.position, r.user_id, p.username, p.display_name, p.avatar_url,
    r.score, r.score_reps, r.selected_lift_id, r.achieved_on, r.any_video
  from ranked r
  join public.profiles p on p.id = r.user_id
  where (_cursor is null)
     or r.score < (_cursor->>'weight_kg')::numeric
     or (r.score = (_cursor->>'weight_kg')::numeric and r.score_reps < (_cursor->>'reps')::integer)
     or (r.score = (_cursor->>'weight_kg')::numeric and r.score_reps = (_cursor->>'reps')::integer
         and r.achieved_on > (_cursor->>'lifted_on')::date)
     or (r.score = (_cursor->>'weight_kg')::numeric and r.score_reps = (_cursor->>'reps')::integer
         and r.achieved_on = (_cursor->>'lifted_on')::date and r.user_id > (_cursor->>'user_id')::uuid)
  order by r.position
  limit greatest(1, least(coalesce(_limit, 50), 10000));
end;
$$;

create or replace function public.get_my_rank(
  _lift text,
  _period text default 'all',
  _scope text default 'global'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  my_row record;
  around_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your rank'; end if;
  select * into my_row
  from public.get_top_lifters(_lift, _period, _scope, 10000, null) t
  where t.user_id = auth.uid()
  limit 1;

  if my_row.user_id is null then
    return jsonb_build_object('rank', null, 'value', null, 'rows', '[]'::jsonb, 'gap_kg', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_position), '[]'::jsonb)
    into around_rows
  from (
    select *
    from public.get_top_lifters(_lift, _period, _scope, 100, null) t
    where t.rank_position between greatest(1, my_row.rank_position - 2) and my_row.rank_position + 2
  ) x;

  return jsonb_build_object(
    'rank', my_row.rank_position,
    'value', my_row.weight_kg,
    'rows', around_rows,
    'gap_kg', (
      select greatest(0, above.weight_kg - my_row.weight_kg)
      from public.get_top_lifters(_lift, _period, _scope, 100, null) above
      where above.rank_position = my_row.rank_position - 1
    )
  );
end;
$$;

create or replace function public.get_top_crews(
  _lift text,
  _period text default 'all',
  _limit integer default 50
)
returns table (
  rank_position bigint,
  crew_id uuid,
  name text,
  emblem text,
  accent_color text,
  member_count bigint,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare period_start date;
begin
  if auth.uid() is null then raise exception 'Sign in to view Crew rankings'; end if;
  if _lift not in ('bench','squat','deadlift','total') then raise exception 'Invalid lift category'; end if;
  if _period not in ('week','month','all') then raise exception 'Invalid period'; end if;
  period_start := case
    when _period = 'week' then date_trunc('week', now() at time zone 'UTC')::date
    when _period = 'month' then date_trunc('month', now() at time zone 'UTC')::date
    else null
  end;
  return query
  with member_best as (
    select cm.crew_id, l.user_id, l.exercise::text as exercise,
      max(l.weight_kg) as best_weight
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    where l.status = 'VERIFIED'
      and l.exercise::text in ('bench','squat','deadlift')
      and (period_start is null or l.lifted_on >= period_start)
    group by cm.crew_id, l.user_id, l.exercise
  ), scored_members as (
    select mb.crew_id, mb.user_id,
      case when _lift = 'total' then sum(mb.best_weight)
           else max(mb.best_weight) end as member_score
    from member_best mb
    where _lift = 'total' or mb.exercise = _lift
    group by mb.crew_id, mb.user_id
    having _lift <> 'total' or count(*) = 3
  ), top_five as (
    select sm.crew_id, sm.user_id, sm.member_score,
      row_number() over(partition by sm.crew_id order by sm.member_score desc, sm.user_id) as member_position
    from scored_members sm
  ), crew_scores as (
    select tf.crew_id, sum(tf.member_score)::numeric as total_score
    from top_five tf where tf.member_position <= 5 group by tf.crew_id
  ), counts as (
    select cm.crew_id, count(*)::bigint as members from public.crew_members cm group by cm.crew_id
  ), visible as (
    select c.id, c.name, c.emblem, c.accent_color, coalesce(ct.members,0) as members,
      coalesce(cs.total_score,0) as score
    from public.crews c
    left join counts ct on ct.crew_id = c.id
    left join crew_scores cs on cs.crew_id = c.id
    where c.is_public = true or exists (
      select 1 from public.crew_members mine where mine.crew_id = c.id and mine.user_id = auth.uid()
    )
  )
  select row_number() over(order by v.score desc, v.id) as position,
    v.id, v.name, v.emblem, v.accent_color, v.members, v.score
  from visible v
  order by v.score desc, v.id
  limit greatest(1, least(coalesce(_limit,50),100));
end;
$$;

create table if not exists public.top_rank_snapshots (
  id bigint generated always as identity primary key,
  snapshot_week date not null,
  lift text not null check (lift in ('bench','squat','deadlift','total')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank_position bigint not null,
  value_kg numeric not null,
  created_at timestamptz not null default now(),
  unique(snapshot_week, lift, user_id)
);
create index if not exists top_rank_snapshots_lookup_idx
  on public.top_rank_snapshots(lift, snapshot_week desc, rank_position);

create or replace function public.capture_top_rank_snapshot()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  week_start date := date_trunc('week', now() at time zone 'UTC')::date;
  category text;
  inserted_count integer := 0;
  current_count integer := 0;
begin
  foreach category in array array['bench','squat','deadlift','total'] loop
    insert into public.top_rank_snapshots(snapshot_week, lift, user_id, rank_position, value_kg)
    select week_start, category, t.user_id, t.rank_position, t.weight_kg
    from public.get_top_lifters(category, 'all', 'global', 10000, null) t
    on conflict(snapshot_week, lift, user_id) do update
      set rank_position = excluded.rank_position, value_kg = excluded.value_kg;
    get diagnostics current_count = row_count;
    inserted_count := inserted_count + current_count;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.get_rank_movers(_lift text default 'bench', _limit integer default 10)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  previous_rank bigint,
  current_rank bigint,
  places_gained bigint,
  is_new boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare this_week date := date_trunc('week', now() at time zone 'UTC')::date;
begin
  if _lift not in ('bench','squat','deadlift','total') then raise exception 'Invalid lift category'; end if;
  return query
  with current_rows as (
    select t.user_id, t.rank_position
    from public.get_top_lifters(_lift, 'all', 'global', 10000, null) t
  ), previous_rows as (
    select s.user_id, s.rank_position
    from public.top_rank_snapshots s
    where s.lift = _lift and s.snapshot_week = this_week - 7
  )
  select c.user_id, p.username, p.display_name, p.avatar_url,
    old.rank_position, c.rank_position,
    case when old.rank_position is null then null else old.rank_position - c.rank_position end,
    old.rank_position is null
  from current_rows c
  join public.profiles p on p.id = c.user_id
  left join previous_rows old on old.user_id = c.user_id
  order by (old.rank_position is null) desc,
    (old.rank_position - c.rank_position) desc nulls last,
    c.rank_position
  limit greatest(1, least(coalesce(_limit,10),50));
end;
$$;

revoke all on function public.get_top_lifters(text,text,text,integer,jsonb) from public, anon;
revoke all on function public.get_my_rank(text,text,text) from public, anon;
revoke all on function public.get_top_crews(text,text,integer) from public, anon;
revoke all on function public.get_rank_movers(text,integer) from public, anon;
revoke all on function public.capture_top_rank_snapshot() from public, anon, authenticated;
grant execute on function public.get_top_lifters(text,text,text,integer,jsonb) to anon, authenticated;
grant execute on function public.get_my_rank(text,text,text) to authenticated;
grant execute on function public.get_top_crews(text,text,integer) to authenticated;
grant execute on function public.get_rank_movers(text,integer) to authenticated;
grant execute on function public.capture_top_rank_snapshot() to service_role;

-- Schedule the weekly snapshot when pg_cron is already enabled in Supabase.
-- If it is not enabled, the migration remains safe; enable pg_cron and run:
-- select cron.schedule('repunit-top-weekly-snapshot', '5 0 * * 1',
--   $select public.capture_top_rank_snapshot();$);
do $schedule$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''repunit-top-weekly-snapshot''';
    execute $job$select cron.schedule('repunit-top-weekly-snapshot', '5 0 * * 1',
      'select public.capture_top_rank_snapshot();')$job$;
  end if;
exception when undefined_table or undefined_function then
  raise notice 'pg_cron is not enabled; configure the weekly TOP snapshot job after enabling it.';
end;
$schedule$;

notify pgrst, 'reload schema';
commit;
