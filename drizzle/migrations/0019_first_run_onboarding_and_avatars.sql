-- REPUNIT 0019: first-run profile setup and public profile avatars.
-- Safe to apply more than once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

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
