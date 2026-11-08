begin;

select plan(5);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'previous_rank' and data_type = 'integer'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'new_rank' and data_type = 'integer'
  ),
  'PR notifications store previous and new leaderboard ranks'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
  'notifications keep row-level security enabled'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'users read own notifications'
      and qual like '%auth.uid()%'
  ),
  'users can only read their own PR celebration notifications'
);

select ok(
  position('previous_rank' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0
  and position('new_rank' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0,
  'verified PR trigger records the rank before and after the PR'
);

select ok(
  position('xp = public.user_progress.xp + 50' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) > 0,
  'PR trigger preserves the existing one-time 50 XP reward'
);

select * from finish();
rollback;
