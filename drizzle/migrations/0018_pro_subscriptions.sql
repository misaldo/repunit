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

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions(status, current_period_end);

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

drop policy if exists "users read own subscription" on public.user_subscriptions;
create policy "users read own subscription"
on public.user_subscriptions for select to authenticated
using (user_id = auth.uid());

commit;
notify pgrst, 'reload schema';
