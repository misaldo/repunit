begin;

select plan(12);

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

select * from finish();
rollback;
