-- REPUNIT 0019: persistent global throne-takeover events for the home feed.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

create table if not exists public.throne_events (
  id uuid primary key default gen_random_uuid(),
  exercise public.exercise not null,
  lifter_id uuid not null references public.profiles(id) on delete cascade,
  previous_lifter_id uuid references public.profiles(id) on delete set null,
  lift_id uuid not null unique references public.lifts(id) on delete cascade,
  weight_kg numeric(6,2) not null,
  reps integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists throne_events_created_idx
  on public.throne_events(created_at desc);

alter table public.throne_events enable row level security;
revoke all on public.throne_events from anon, authenticated;
grant select on public.throne_events to authenticated;

drop policy if exists "signed in users read throne events" on public.throne_events;
create policy "signed in users read throne events"
on public.throne_events for select to authenticated using (true);

create or replace function public.repunit_record_throne_takeover()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous_top record;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  select l.user_id, l.weight_kg, l.reps, l.lifted_on
    into previous_top
  from public.lifts l
  where l.exercise = new.exercise
    and l.status = 'VERIFIED'
    and l.id <> new.id
  order by l.weight_kg desc, l.reps desc, l.lifted_on asc
  limit 1;

  if previous_top.user_id is not null
     and previous_top.user_id <> new.user_id
     and (
       new.weight_kg > previous_top.weight_kg
       or (new.weight_kg = previous_top.weight_kg and new.reps > previous_top.reps)
       or (new.weight_kg = previous_top.weight_kg and new.reps = previous_top.reps and new.lifted_on < previous_top.lifted_on)
     ) then
    insert into public.throne_events(exercise, lifter_id, previous_lifter_id, lift_id, weight_kg, reps)
    values(new.exercise, new.user_id, previous_top.user_id, new.id, new.weight_kg, new.reps)
    on conflict(lift_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lifts_record_throne_takeover on public.lifts;
create trigger lifts_record_throne_takeover
after insert or update of status on public.lifts
for each row execute function public.repunit_record_throne_takeover();

commit;
notify pgrst, 'reload schema';
