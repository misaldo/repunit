-- REPUNIT 0041 TOP ranking benchmark.
-- Run ONLY on an isolated staging database populated with at least 10,000
-- profiles and 200,000 VERIFIED lifts. Never run the fixture load on production.
-- Record planning time, execution time, shared buffer reads/hits and compare
-- each query against the <100 ms target in the product specification.
--
-- This file does not seed or mutate data. It only measures the ranking RPCs.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles order by id limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

explain (analyze, buffers, settings)
select * from public.get_top_lifters('bench', 'all', 'global', 50, null);

explain (analyze, buffers, settings)
select * from public.get_top_lifters('total', 'all', 'global', 50, null);

explain (analyze, buffers, settings)
select public.get_my_rank('bench', 'all', 'global');

explain (analyze, buffers, settings)
select * from public.get_top_crews('bench', 'all', 50);

explain (analyze, buffers, settings)
select * from public.get_rank_movers('bench', 10);

rollback;
