-- Add a weekday to each workout plan.
alter table public.workout_plans
  add column if not exists workout_day text not null default 'Monday'
  check (workout_day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));

create index if not exists workout_plans_user_day_idx
  on public.workout_plans(user_id, workout_day);
