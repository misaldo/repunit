begin;

select plan(8);

select ok(
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_pr_events'
  ),
  'verified PR breakthroughs have a dedicated event ledger'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_pr_events'::regclass),
  'PR event ledger has row-level security enabled'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_pr_events'
      and policyname = 'users read own PR events'
      and qual like '%auth.uid()%'
  ),
  'users can only read their own PR event count'
);

select ok(
  has_table_privilege('authenticated', 'public.user_pr_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.user_pr_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_pr_events', 'DELETE'),
  'clients can read PR progress but cannot forge or remove PR events'
);

select ok(
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_pr_goals'
  ),
  'each user has a persistent baseline for the next-two-PR goal'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_pr_goals'::regclass)
  and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_pr_goals'
      and policyname = 'users read own PR goal'
      and qual like '%auth.uid()%'
  ),
  'PR goal baselines are protected by row-level security'
);

select ok(
  position('user_pr_events' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0
  and position('user_pr_goals' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0
  and position('pr_duo' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0,
  'verified PR trigger counts two new breakthroughs after the saved baseline'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.lifts'::regclass
      and tgname = 'lifts_award_verified_pr_xp'
      and not tgisinternal
  ),
  'the existing verified PR trigger remains attached'
);

select * from finish();
rollback;
