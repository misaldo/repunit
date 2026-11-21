-- REPUNIT 0047: pause paid-plan enforcement during the free launch phase.
-- Keeps the trigger/function in place so the limit can be re-enabled later.
-- Subscription records and Stripe integration are intentionally preserved.

begin;

create or replace function public.repunit_enforce_workout_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $repunit$
begin
  -- No workout-plan limit while REPUNIT is free for everyone.
  return new;
end;
$repunit$;

commit;
notify pgrst, 'reload schema';
