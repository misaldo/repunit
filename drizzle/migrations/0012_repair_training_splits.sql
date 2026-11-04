-- REPUNIT 0012: repair Training Splits tables on an existing Supabase project.
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  visibility text not null default 'private'
    check (visibility in ('public','private','followers')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_plans
  add column if not exists workout_day text not null default 'Monday';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_plans'::regclass
      and conname = 'workout_plans_workout_day_check'
  ) then
    alter table public.workout_plans
      add constraint workout_plans_workout_day_check
      check (workout_day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));
  end if;
end $$;

create index if not exists workout_plans_user_created_idx
  on public.workout_plans(user_id, created_at desc);
create index if not exists workout_plans_visibility_idx
  on public.workout_plans(visibility, created_at desc);
create index if not exists workout_plans_user_day_idx
  on public.workout_plans(user_id, workout_day);

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  sets integer not null check (sets between 1 and 30),
  reps text not null check (char_length(reps) between 1 and 20),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  notes text check (notes is null or char_length(notes) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists workout_plan_exercises_plan_idx
  on public.workout_plan_exercises(plan_id, position);

alter table public.workout_plans enable row level security;
alter table public.workout_plan_exercises enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.workout_plan_exercises to authenticated;

drop policy if exists "workout plans readable by visibility" on public.workout_plans;
create policy "workout plans readable by visibility"
on public.workout_plans for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or (
    visibility = 'followers'
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = workout_plans.user_id
    )
  )
);

drop policy if exists "users create own workout plans" on public.workout_plans;
create policy "users create own workout plans"
on public.workout_plans for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own workout plans" on public.workout_plans;
create policy "users update own workout plans"
on public.workout_plans for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete own workout plans" on public.workout_plans;
create policy "users delete own workout plans"
on public.workout_plans for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "exercises readable with plan" on public.workout_plan_exercises;
create policy "exercises readable with plan"
on public.workout_plan_exercises for select to authenticated
using (
  exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
        )
      )
  )
);

drop policy if exists "owners manage plan exercises" on public.workout_plan_exercises;
create policy "owners manage plan exercises"
on public.workout_plan_exercises for all to authenticated
using (
  exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id and p.user_id = auth.uid()
  )
);

create or replace function public.touch_workout_plan_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists t_workout_plans_updated_at on public.workout_plans;
create trigger t_workout_plans_updated_at
before update on public.workout_plans
for each row execute function public.touch_workout_plan_updated_at();

notify pgrst, 'reload schema';
