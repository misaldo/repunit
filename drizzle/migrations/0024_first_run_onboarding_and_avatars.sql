-- REPUNIT 0019: first-run profile setup and public profile avatars.
-- Safe to apply more than once in the Supabase SQL Editor.

-- Ensure the SPLIT tables exist even in preview projects that have not yet
-- received the earlier training-split repair migration.
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  visibility text not null default 'private' check (visibility in ('public','private','followers')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workout_plans add column if not exists workout_day text not null default 'Monday';

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

alter table public.workout_plans enable row level security;
alter table public.workout_plan_exercises enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.workout_plan_exercises to authenticated;

drop policy if exists "workout plans readable by visibility" on public.workout_plans;
create policy "workout plans readable by visibility"
on public.workout_plans for select to authenticated
using (
  user_id = auth.uid() or visibility = 'public'
  or (visibility = 'followers' and exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.following_id = workout_plans.user_id
  ))
);
drop policy if exists "users create own workout plans" on public.workout_plans;
create policy "users create own workout plans" on public.workout_plans for insert to authenticated
with check (user_id = auth.uid());
drop policy if exists "users update own workout plans" on public.workout_plans;
create policy "users update own workout plans" on public.workout_plans for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users delete own workout plans" on public.workout_plans;
create policy "users delete own workout plans" on public.workout_plans for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "exercises readable with plan" on public.workout_plan_exercises;
create policy "exercises readable with plan" on public.workout_plan_exercises for select to authenticated
using (exists (
  select 1 from public.workout_plans p
  where p.id = workout_plan_exercises.plan_id
    and (p.user_id = auth.uid() or p.visibility = 'public'
      or (p.visibility = 'followers' and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = p.user_id
      )))
));
drop policy if exists "owners manage plan exercises" on public.workout_plan_exercises;
create policy "owners manage plan exercises" on public.workout_plan_exercises for all to authenticated
using (exists (select 1 from public.workout_plans p where p.id = workout_plan_exercises.plan_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.workout_plans p where p.id = workout_plan_exercises.plan_id and p.user_id = auth.uid()));

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

insert into storage.buckets (id, name, public)
values ('lift-videos', 'lift-videos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Public avatar images are readable" on storage.objects;
create policy "Public avatar images are readable"
on storage.objects for select to public
using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public profiles can display only public workout plans and their exercises,
-- even when a visitor opens a shared profile without signing in.
grant select on public.workout_plans, public.workout_plan_exercises to anon;

drop policy if exists "Public workout plans readable by visitors" on public.workout_plans;
create policy "Public workout plans readable by visitors"
on public.workout_plans for select to anon
using (visibility = 'public');

drop policy if exists "Public workout exercises readable by visitors" on public.workout_plan_exercises;
create policy "Public workout exercises readable by visitors"
on public.workout_plan_exercises for select to anon
using (
  exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id and p.visibility = 'public'
  )
);

-- Lift evidence is intentionally public on REPUNIT; allow shared lift pages
-- to create signed playback URLs for visitors without a signed-in session.
drop policy if exists "Public lift evidence readable by visitors" on storage.objects;
create policy "Public lift evidence readable by visitors"
on storage.objects for select to anon
using (bucket_id = 'lift-videos');

notify pgrst, 'reload schema';
