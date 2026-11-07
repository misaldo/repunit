-- REPUNIT 0036: include overhead press in the Crew all-lifts total.
-- The global TOP Total remains the Big Three; Crew total covers all four core PR lifts.

begin;

create or replace function public.crew_leaderboard(
  _exercise text,
  _from date default null,
  _to date default null
)
returns table(
  id uuid,
  name text,
  emblem text,
  accent_color text,
  total numeric,
  members bigint,
  wins bigint,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view Crew rankings';
  end if;
  if _exercise not in ('bench','squat','deadlift','ohp','total') then
    raise exception 'Invalid Crew ranking category';
  end if;

  return query
  with visible_crews as (
    select c.id, c.name, c.emblem, c.accent_color
    from public.crews c
    where c.is_public = true
      or exists (
        select 1 from public.crew_members mine
        where mine.crew_id = c.id and mine.user_id = auth.uid()
      )
  ),
  member_counts as (
    select cm.crew_id,
      count(*)::bigint as member_count,
      bool_or(cm.user_id = auth.uid()) as is_mine
    from public.crew_members cm
    group by cm.crew_id
  ),
  lift_totals as (
    select cm.crew_id,
      coalesce(sum(l.weight_kg * greatest(coalesce(l.reps, 1), 1)), 0)::numeric as score
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    where l.status = 'VERIFIED'
      and (
        (_exercise = 'total' and l.exercise::text in ('bench','squat','deadlift','ohp'))
        or l.exercise::text = _exercise
      )
      and (_from is null or l.lifted_on >= _from)
      and (_to is null or l.lifted_on < _to)
    group by cm.crew_id
  ),
  battle_wins as (
    select b.winner_crew_id as crew_id, count(*)::bigint as win_count
    from public.crew_battles b
    where b.status = 'completed'
      and b.is_weekly = true
      and b.winner_crew_id is not null
    group by b.winner_crew_id
  )
  select vc.id, vc.name, vc.emblem, vc.accent_color,
    coalesce(lt.score, 0)::numeric,
    coalesce(mc.member_count, 0)::bigint,
    coalesce(bw.win_count, 0)::bigint,
    coalesce(mc.is_mine, false)
  from visible_crews vc
  left join member_counts mc on mc.crew_id = vc.id
  left join lift_totals lt on lt.crew_id = vc.id
  left join battle_wins bw on bw.crew_id = vc.id
  order by coalesce(lt.score, 0) desc, vc.name asc;
end;
$$;

revoke all on function public.crew_leaderboard(text, date, date) from public, anon;
grant execute on function public.crew_leaderboard(text, date, date) to authenticated;

notify pgrst, 'reload schema';
commit;
