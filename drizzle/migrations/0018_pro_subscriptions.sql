-- REPUNIT 0018: server-managed Stripe subscription state.
-- Clients can read their own status but cannot grant themselves PRO.

begin;

create table if not exists public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_theme text not null default 'default';

do $repunit$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_profile_theme_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_profile_theme_allowed
      check (profile_theme in ('default','ember','steel','violet'));
  end if;
end;
$repunit$;

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions(status, current_period_end);

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

drop policy if exists "users read own subscription" on public.user_subscriptions;
create policy "users read own subscription"
on public.user_subscriptions for select to authenticated
using (user_id = auth.uid());

-- Publicly expose only the fact that a profile has an active PRO badge.
create or replace view public.pro_badges as
select user_id from public.user_subscriptions where status in ('active','trialing');
grant select on public.pro_badges to anon, authenticated;

create or replace function public.repunit_guard_pro_profile_theme()
returns trigger language plpgsql security definer set search_path = public as $repunit$
declare
  theme_changed boolean := false;
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      theme_changed := new.profile_theme <> 'default';
    else
      theme_changed := new.profile_theme <> 'default' and new.profile_theme is distinct from old.profile_theme;
    end if;
    if theme_changed and not exists (
      select 1 from public.user_subscriptions
      where user_id = auth.uid() and status in ('active','trialing')
    ) then
      raise exception 'Custom profile themes require REPUNIT PRO';
    end if;
  end if;
  return new;
end;
$repunit$;
drop trigger if exists profiles_guard_pro_theme on public.profiles;
create trigger profiles_guard_pro_theme
before insert or update of profile_theme on public.profiles
for each row execute function public.repunit_guard_pro_profile_theme();

-- Enforce the Free workout-plan limit in the database, not only in the UI.
create or replace function public.repunit_enforce_workout_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $repunit$
declare plan_count integer;
begin
  if auth.uid() is not null and new.user_id = auth.uid()
     and not exists (
       select 1 from public.user_subscriptions
       where user_id = auth.uid() and status in ('active','trialing')
     ) then
    select count(*) into plan_count from public.workout_plans where user_id = auth.uid();
    if plan_count >= 3 then
      raise exception 'Free accounts can save up to 3 workout plans. Upgrade to REPUNIT PRO for unlimited plans.';
    end if;
  end if;
  return new;
end;
$repunit$;
drop trigger if exists workout_plans_enforce_free_limit on public.workout_plans;
create trigger workout_plans_enforce_free_limit
before insert on public.workout_plans
for each row execute function public.repunit_enforce_workout_plan_limit();

commit;
notify pgrst, 'reload schema';
