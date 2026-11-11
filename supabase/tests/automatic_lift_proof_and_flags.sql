begin;

select plan(29);

select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'lift_status' and e.enumlabel = 'NEEDS_PROOF'
  ),
  'lift_status includes NEEDS_PROOF'
);

select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'lift_status' and e.enumlabel = 'UNDER_REVIEW'
  ),
  'lift_status includes UNDER_REVIEW'
);

select has_table('public', 'lift_flags', 'Crew lift flags are stored in a dedicated table');
select has_column('public', 'lifts', 'verification_reason', 'The database stores why proof is required');
select has_column('public', 'lifts', 'xp_awarded_at', 'Verified lift XP is tracked to prevent duplicate rewards');
select has_column('public', 'lifts', 'verified_at', 'The database records when a lift entered rankings');

select ok(
  has_function_privilege('authenticated', 'public.flag_lift(uuid)', 'EXECUTE'),
  'signed-in users can call the guarded flag RPC'
);

select ok(
  not has_function_privilege('anon', 'public.flag_lift(uuid)', 'EXECUTE'),
  'anonymous users cannot flag lifts'
);

select ok(
  has_function_privilege('authenticated', 'public.attach_lift_video(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.attach_lift_video(uuid,text)', 'EXECUTE'),
  'only signed-in users can call the guarded proof RPC'
);

select ok(
  not has_column_privilege('authenticated', 'public.lifts', 'status', 'UPDATE'),
  'authenticated clients cannot directly update lift status'
);

select ok(
  not has_column_privilege('authenticated', 'public.lifts', 'status', 'INSERT'),
  'authenticated clients cannot choose status during lift insertion'
);

select ok(
  not has_column_privilege('authenticated', 'public.lifts', 'video_path', 'UPDATE'),
  'authenticated clients must use the guarded proof RPC to attach video'
);

select ok(
  to_regprocedure('public.admin_list_pending_lifts()') is null,
  'the manual admin lift queue RPC is removed'
);

select ok(
  to_regprocedure('public.admin_review_lift(uuid,text)') is null,
  'the manual admin review RPC is removed'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.lifts'::regclass
      and tgname = 'lifts_require_pending_on_insert'
      and not tgisinternal
  ),
  'every user lift insert passes through the server-side classifier'
);

select ok(
  position('daily_count >= 10' in lower(pg_get_functiondef('public.require_pending_lift_submission()'::regprocedure))) > 0,
  'the database enforces the daily submission limit'
);

select ok(
  position('weight or reps are outside the plausible range' in lower(pg_get_functiondef('public.require_pending_lift_submission()'::regprocedure))) > 0,
  'the database checks exercise-specific plausible weight and reps'
);

select ok(
  position('this looks like a duplicate lift' in lower(pg_get_functiondef('public.require_pending_lift_submission()'::regprocedure))) > 0,
  'the database detects duplicate lift submissions'
);

select ok(
  position('a pr jump over 10% needs video proof' in lower(pg_get_functiondef('public.require_pending_lift_submission()'::regprocedure))) > 0
  and position('only one unproven pr jump is allowed' in lower(pg_get_functiondef('public.require_pending_lift_submission()'::regprocedure))) > 0,
  'the database limits unproven PR jumps to one per day and 10 percent'
);

select ok(
  position('count(distinct f.flagger_id)' in lower(pg_get_functiondef('public.flag_lift(uuid)'::regprocedure))) > 0
  and position('flag_count >= 3' in lower(pg_get_functiondef('public.flag_lift(uuid)'::regprocedure))) > 0,
  'three distinct Crew members are required to flag a lift under review'
);

select ok(
  position('verified_at = null' in lower(pg_get_functiondef('public.flag_lift(uuid)'::regprocedure))) > 0,
  'flagging a lift removes its verified timestamp from PR calculations'
);

select ok(
  position('status in (''needs_proof'', ''under_review'', ''pending''' in lower(pg_get_functiondef('public.attach_lift_video(uuid,text)'::regprocedure))) > 0,
  'video proof can resolve only lifts waiting for proof or review'
);

select ok(
  not has_table_privilege('authenticated', 'public.lift_flags', 'SELECT'),
  'clients cannot read Crew flag identities directly'
);

select ok(
  position('pg_advisory_xact_lock' in lower(pg_get_functiondef('public.attach_lift_video(uuid,text)'::regprocedure))) > 0,
  'proof verification shares the per-user lock used by lift submissions'
);


select has_table('public', 'lift_video_fingerprints', 'Video fingerprints are stored for duplicate detection');

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.lifts'::regclass
      and tgname = 'zzzz_lifts_require_ai_review'
      and not tgisinternal
  ),
  'every client lift insert is forced into AI review after legacy classification'
);

select ok(
  position('ai_analyzing' in lower(pg_get_functiondef('public.repunit_force_lift_ai_review()'::regprocedure))) > 0
  and position('verified_at := null' in lower(pg_get_functiondef('public.repunit_force_lift_ai_review()'::regprocedure))) > 0,
  'client lift submissions cannot become verified just because a video exists'
);

select ok(
  position('status = ''ai_analyzing''' in lower(pg_get_functiondef('public.attach_lift_video(uuid,text)'::regprocedure))) > 0
  and position('status = ''verified''' in lower(pg_get_functiondef('public.attach_lift_video(uuid,text)'::regprocedure))) = 0,
  'attaching replacement video starts analysis instead of verifying the lift'
);

select ok(
  not has_table_privilege('authenticated', 'public.lift_video_fingerprints', 'SELECT')
  and not has_table_privilege('authenticated', 'public.lift_video_fingerprints', 'INSERT'),
  'video fingerprint records are private to the trusted analysis worker'
);

select * from finish();
rollback;
