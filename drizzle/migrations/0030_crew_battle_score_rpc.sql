-- REPUNIT 0030: calculate weekly battle totals and top contributors in Postgres.
-- The client receives only the two scores and up to three contributors per side.

begin;

create or replace function public.crew_battle_score(_battle uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.crew_battles%rowtype;
  left_total numeric := 0;
  right_total numeric := 0;
  left_contributors jsonb := '[]'::jsonb;
  right_contributors jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view this battle';
  end if;

  select * into b from public.crew_battles where id = _battle;
  if not found then
    raise exception 'Battle not found';
  end if;

  if not (
    public.is_crew_member(b.challenger_crew_id, auth.uid())
    or public.is_crew_member(b.opponent_crew_id, auth.uid())
  ) then
    raise exception 'Join one of the crews to view this battle';
  end if;

  select coalesce(sum(member_score), 0) into left_total
  from (
    select cm.user_id,
      case when b.category = 'volume'
        then sum(l.weight_kg * greatest(coalesce(l.reps, 1), 1))
        else max(l.weight_kg)
      end as member_score
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    where cm.crew_id = b.challenger_crew_id
      and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date
      and l.lifted_on < b.ends_at::date
      and (b.category = 'volume' or l.exercise::text = b.category)
    group by cm.user_id
  ) scores;

  select coalesce(sum(member_score), 0) into right_total
  from (
    select cm.user_id,
      case when b.category = 'volume'
        then sum(l.weight_kg * greatest(coalesce(l.reps, 1), 1))
        else max(l.weight_kg)
      end as member_score
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    where cm.crew_id = b.opponent_crew_id
      and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date
      and l.lifted_on < b.ends_at::date
      and (b.category = 'volume' or l.exercise::text = b.category)
    group by cm.user_id
  ) scores;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', ranked.user_id,
    'username', ranked.username,
    'display_name', ranked.display_name,
    'weight', ranked.member_score
  ) order by ranked.member_score desc), '[]'::jsonb)
  into left_contributors
  from (
    select cm.user_id, p.username, p.display_name,
      case when b.category = 'volume'
        then sum(l.weight_kg * greatest(coalesce(l.reps, 1), 1))
        else max(l.weight_kg)
      end as member_score
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    left join public.profiles p on p.id = cm.user_id
    where cm.crew_id = b.challenger_crew_id
      and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date
      and l.lifted_on < b.ends_at::date
      and (b.category = 'volume' or l.exercise::text = b.category)
    group by cm.user_id, p.username, p.display_name
    order by member_score desc
    limit 3
  ) ranked;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', ranked.user_id,
    'username', ranked.username,
    'display_name', ranked.display_name,
    'weight', ranked.member_score
  ) order by ranked.member_score desc), '[]'::jsonb)
  into right_contributors
  from (
    select cm.user_id, p.username, p.display_name,
      case when b.category = 'volume'
        then sum(l.weight_kg * greatest(coalesce(l.reps, 1), 1))
        else max(l.weight_kg)
      end as member_score
    from public.crew_members cm
    join public.lifts l on l.user_id = cm.user_id
    left join public.profiles p on p.id = cm.user_id
    where cm.crew_id = b.opponent_crew_id
      and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date
      and l.lifted_on < b.ends_at::date
      and (b.category = 'volume' or l.exercise::text = b.category)
    group by cm.user_id, p.username, p.display_name
    order by member_score desc
    limit 3
  ) ranked;

  return jsonb_build_object(
    'left', jsonb_build_object('total', left_total, 'contributors', left_contributors),
    'right', jsonb_build_object('total', right_total, 'contributors', right_contributors)
  );
end;
$$;

revoke all on function public.crew_battle_score(uuid) from public, anon;
grant execute on function public.crew_battle_score(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
