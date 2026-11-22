-- Disposable PostgreSQL schema for TOP migration CI tests only.
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create type public.lift_exercise as enum ('bench','squat','deadlift','ohp','pullup');
create type public.lift_status as enum ('PENDING','AI_ANALYZING','AI_CHECKED','NEEDS_REVIEW','VERIFIED','REJECTED');
create table public.profiles (
  id uuid primary key,
  username text,
  display_name text,
  avatar_url text,
  country_code char(2)
);
create table public.crews (
  id uuid primary key,
  name text not null,
  emblem text,
  accent_color text,
  is_public boolean not null default true
);
create table public.crew_members (
  crew_id uuid not null references public.crews(id),
  user_id uuid not null references public.profiles(id),
  role text,
  joined_at timestamptz default now(),
  primary key (crew_id,user_id)
);
create table public.lifts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  exercise public.lift_exercise not null,
  weight_kg numeric not null,
  reps integer not null,
  lifted_on date not null,
  video_path text,
  status public.lift_status not null
);
