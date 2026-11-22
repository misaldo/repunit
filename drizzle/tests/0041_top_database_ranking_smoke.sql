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
  total_count integer;
  expected_total integer;
  my_country char(2);
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
    with first_page as materialized (
      select * from public.get_top_lifters('bench', 'all', 'global', 50, null)
    ), cursor_row as (
      select * from first_page order by rank_position desc limit 1
    ), second_page as (
      select page.* from cursor_row c
      cross join lateral public.get_top_lifters(
        'bench', 'all', 'global', 50,
        jsonb_build_object(
          'weight_kg', c.weight_kg,
          'reps', c.reps,
          'lifted_on', c.lifted_on,
          'user_id', c.user_id
        )
      ) page
    )
    select 1 from first_page a join second_page b using (user_id)
  ) then raise exception 'Keyset pagination returned duplicate users'; end if;

  if (
    select min(rank_position)
    from public.get_top_lifters(
      'bench', 'all', 'global', 50,
      (select jsonb_build_object('weight_kg', weight_kg, 'reps', reps, 'lifted_on', lifted_on, 'user_id', user_id)
       from public.get_top_lifters('bench', 'all', 'global', 50, null)
       order by rank_position desc limit 1)
    )
  ) <> 51 then raise exception 'Second TOP page did not continue at rank 51'; end if;

  if exists (
    select 1 from public.get_top_lifters('total', 'all', 'global', 100, null) t
    where t.lift_id is not null
  ) then raise exception 'Total ranking must not claim a single lift id'; end if;

  select count(*) into total_count
  from public.get_top_lifters('total', 'all', 'global', 10000, null);
  select count(*) into expected_total
  from (
    select user_id from public.lifts
    where status = 'VERIFIED' and exercise::text in ('bench','squat','deadlift')
    group by user_id having count(distinct exercise) = 3
  ) eligible;
  if total_count <> expected_total then
    raise exception 'Total must include exactly users with all three verified lifts (expected %, got %)', expected_total, total_count;
  end if;

  -- A user opting out disappears from global TOP, while their data remains stored.
  perform public.set_top_opt_out(true);
  if exists (
    select 1 from public.get_top_lifters('bench', 'all', 'global', 10000, null) t
    where t.user_id = test_user
  ) then raise exception 'Opted-out user is still visible in global TOP'; end if;
  perform public.set_top_opt_out(false);
  if not exists (
    select 1 from public.get_top_lifters('bench', 'all', 'global', 10000, null) t
    where t.user_id = test_user
  ) then raise exception 'Restored user did not return to global TOP'; end if;

  select country_code into my_country from public.profiles where id = test_user;
  if my_country is not null and exists (
    select 1 from public.get_top_lifters('bench', 'all', 'country', 10000, null) t
    join public.profiles p on p.id = t.user_id
    where p.country_code <> my_country
  ) then raise exception 'Country scope returned a user from another country'; end if;

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
