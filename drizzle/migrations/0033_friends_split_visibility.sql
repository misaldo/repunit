-- REPUNIT 0033: Friends-only SPLIT visibility requires a mutual follow.
-- Keep the existing 'followers' storage value for backward compatibility;
-- the UI presents it as Friends.

begin;

drop policy if exists "workout plans readable by visibility" on public.workout_plans;
create policy "workout plans readable by visibility"
on public.workout_plans for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or (
    visibility = 'followers'
    and exists (
      select 1 from public.follows outgoing
      where outgoing.follower_id = auth.uid()
        and outgoing.following_id = workout_plans.user_id
    )
    and exists (
      select 1 from public.follows incoming
      where incoming.follower_id = workout_plans.user_id
        and incoming.following_id = auth.uid()
    )
  )
);

drop policy if exists "exercises readable with plan" on public.workout_plan_exercises;
create policy "exercises readable with plan"
on public.workout_plan_exercises for select to authenticated
using (
  exists (
    select 1
    from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows outgoing
            where outgoing.follower_id = auth.uid()
              and outgoing.following_id = p.user_id
          )
          and exists (
            select 1 from public.follows incoming
            where incoming.follower_id = p.user_id
              and incoming.following_id = auth.uid()
          )
        )
      )
  )
);

notify pgrst, 'reload schema';
commit;
