begin;

select plan(3);

-- Simulate a normal signed-in user. This UUID does not need to exist because
-- the RPC must reject the caller before looking up any lift row.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.has_role(auth.uid(), 'admin'),
  false,
  'a normal user does not have the admin role'
);

select throws_ok(
  $$select public.admin_list_pending_lifts()$$,
  '42501',
  'Only admins can view pending lifts',
  'a normal user cannot list pending lifts'
);

select throws_ok(
  $$select public.admin_review_lift('22222222-2222-4222-8222-222222222222', 'approve')$$,
  '42501',
  'Only admins can review lifts',
  'a normal user cannot approve or reject a lift'
);

select * from finish();
rollback;
