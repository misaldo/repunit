-- REPUNIT: workout plans, challenges and trusted lift verification
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  visibility text not null default 'private' check (visibility in ('public','private','followers')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_plans_user_created_idx on public.workout_plans(user_id, created_at desc);
create index if not exists workout_plans_visibility_idx on public.workout_plans(visibility, created_at desc);
alter table public.workout_plans enable row level security;
grant select, insert, update, delete on public.workout_plans to authenticated;
create policy "workout plans readable by visibility" on public.workout_plans for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'followers' and exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = user_id
  ))
);
create policy "users create own workout plans" on public.workout_plans for insert to authenticated with check (user_id = auth.uid());
create policy "users update own workout plans" on public.workout_plans for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own workout plans" on public.workout_plans for delete to authenticated using (user_id = auth.uid());

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  sets integer not null check (sets between 1 and 30),
  reps text not null check (char_length(reps) between 1 and 20),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  notes text check (char_length(notes) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workout_plan_exercises_plan_idx on public.workout_plan_exercises(plan_id, position);
alter table public.workout_plan_exercises enable row level security;
grant select, insert, update, delete on public.workout_plan_exercises to authenticated;
create policy "exercises readable with plan" on public.workout_plan_exercises for select to authenticated
using (exists (select 1 from public.workout_plans p where p.id = plan_id and (
  p.user_id = auth.uid() or p.visibility = 'public' or
  (p.visibility = 'followers' and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id))
)));
create policy "owners manage plan exercises" on public.workout_plan_exercises for all to authenticated
using (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid()));

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','open','active','completed','cancelled')),
  prize_amount numeric(12,2),
  prize_currency text not null default 'CZK' check (prize_currency in ('CZK','EUR','USD')),
  rules_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (prize_amount is null or prize_amount >= 0)
);
create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_id uuid references public.lifts(id) on delete set null,
  entered_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;
grant select on public.challenges, public.challenge_entries to authenticated;
grant insert on public.challenge_entries to authenticated;
create policy "published challenges readable" on public.challenges for select to authenticated using (status <> 'draft' or created_by = auth.uid());
create policy "challenge creator manages draft" on public.challenges for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "challenge entries readable" on public.challenge_entries for select to authenticated using (true);
create policy "users enter as themselves" on public.challenge_entries for insert to authenticated with check (user_id = auth.uid());

-- Prevent ordinary users from changing lift evidence, ownership or verification state after submission.
create or replace function public.protect_lift_verification_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or new.video_path is distinct from old.video_path
      or new.status is distinct from old.status then
      raise exception 'Submitted lift evidence and verification status cannot be changed directly';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_lift_verification_fields on public.lifts;
create trigger protect_lift_verification_fields before update on public.lifts
for each row execute function public.protect_lift_verification_fields();

create or replace function public.touch_workout_plan_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists t_workout_plans_updated_at on public.workout_plans;
create trigger t_workout_plans_updated_at before update on public.workout_plans
for each row execute function public.touch_workout_plan_updated_at();
