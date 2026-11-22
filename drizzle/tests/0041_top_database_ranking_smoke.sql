-- REPUNIT 0041 TOP ranking smoke tests.
-- Run against an isolated staging database AFTER applying 0041_top_database_ranking.sql.
-- Read-only: no fixture rows are inserted or updated.
begin;

do $$
declare
  test_user uuid;
  previous_rank bigint := 0;
  row_rank bigint;
  row_user_id uuid;
  result_count integer := 0;
  my_rank jsonb;
begin
  select id into test_user from public.profiles order by id limit 1;
  if test_user is null then
    raise exception 'TOP smoke test requires at least one profile';
  end if;

  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_top_lifters'
  ) then raise exception 'get_top_lifters RPC is missing'; end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'top_rank_snapshots' and c.relrowsecurity
  ) then raise exception 'top_rank_snapshots must have RLS enabled'; end if;

  for row_rank, row_user_id in
    select t.rank_position, t.user_id
    from public.get_top_lifters('bench', 'all', 'global', 100, null) t
    order by t.rank_position
  loop
    if row_rank <= previous_rank then
      raise exception 'Bench rank positions are not strictly increasing';
    end if;
    if row_user_id is null then
      raise exception 'Bench ranking returned a null user id';
    end if;
    previous_rank := row_rank;
    result_count := result_count + 1;
  end loop;

  if exists (
    select user_id from public.get_top_lifters('bench', 'all', 'global', 100, null)
    group by user_id having count(*) > 1
  ) then raise exception 'Bench ranking returned duplicate users'; end if;

  if exists (
    select 1 from public.get_top_lifters('total', 'all', 'global', 100, null) t
    where t.lift_id is not null
  ) then raise exception 'Total ranking must not claim a single lift id'; end if;

  if exists (
    select 1 from public.get_top_crews('bench', 'all', 100) t
    where t.rank_position is null or t.crew_id is null
  ) then raise exception 'Crew ranking returned invalid rank or crew id'; end if;

  my_rank := public.get_my_rank('bench', 'all', 'global');
  if my_rank is null or not (my_rank ? 'rank') then
    raise exception 'get_my_rank returned an invalid payload';
  end if;

  perform public.get_rank_movers('bench', 10);
  raise notice 'TOP smoke tests passed; Bench rows checked: %', result_count;
end;
$$;

rollback;
