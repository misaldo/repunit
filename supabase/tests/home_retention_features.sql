begin;

select plan(2);

select ok(
  to_regprocedure('public.award_verified_pr_xp()') is not null
  and position('repunit_notification_enabled' in pg_get_functiondef('public.award_verified_pr_xp()'::regprocedure)) = 0,
  'personal record events are created independently of optional notification preferences'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.crew_battles'::regclass
      and tgname = 'crew_battles_award_weekly_winners'
      and not tgisinternal
  ),
  'completed weekly Crew battles award the Weekly Winners badge'
);

select * from finish();
rollback;
