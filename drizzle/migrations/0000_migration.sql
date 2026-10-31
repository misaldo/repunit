create type public.app_role as enum ('admin','moderator','user');
create type public.lift_status as enum ('PENDING','AI_ANALYZING','AI_CHECKED','NEEDS_REVIEW','VERIFIED','REJECTED');
create type public.exercise as enum ('bench','squat','deadlift','ohp','pullup');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 280),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := base || 'lifter'; end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1; candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, candidate, left(coalesce(new.raw_user_meta_data->>'display_name', candidate),40));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  description text check (char_length(description) <= 280),
  logo_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index on public.crew_members(user_id);

create or replace function public.is_crew_member(_crew uuid, _user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = _crew and user_id = _user) $$;

grant select (id, name, description, logo_url, owner_id, created_at, updated_at) on public.crews to authenticated;
grant insert (name, description, logo_url, owner_id) on public.crews to authenticated;
grant update (name, description, logo_url) on public.crews to authenticated;
grant delete on public.crews to authenticated;
grant all on public.crews to service_role;
alter table public.crews enable row level security;
create policy "crews read" on public.crews for select to authenticated using (true);
create policy "crews create" on public.crews for insert to authenticated with check (owner_id = auth.uid());
create policy "crews owner update" on public.crews for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "crews owner delete" on public.crews for delete to authenticated using (owner_id = auth.uid());

grant select, delete on public.crew_members to authenticated;
grant all on public.crew_members to service_role;
alter table public.crew_members enable row level security;
create policy "members read" on public.crew_members for select to authenticated using (true);
create policy "members leave" on public.crew_members for delete to authenticated using (user_id = auth.uid() and role <> 'owner');

create or replace function public.crew_invite_code(_crew uuid) returns text
language sql stable security definer set search_path = public as $$
  select invite_code from public.crews where id = _crew and public.is_crew_member(_crew, auth.uid()) $$;

create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.crew_members(crew_id,user_id,role) values (new.id,new.owner_id,'owner'); return new; end $$;
create trigger crews_owner_member after insert on public.crews for each row execute function public.add_owner_member();

create or replace function public.join_crew(_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into c from public.crews where invite_code = lower(trim(_code));
  if c is null then raise exception 'Invalid invite code'; end if;
  insert into public.crew_members(crew_id,user_id) values (c, auth.uid()) on conflict do nothing;
  return c;
end $$;
create or replace function public.crew_preview(_code text) returns table(id uuid, name text, description text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.description, (select count(*) from public.crew_members m where m.crew_id=c.id)
  from public.crews c where c.invite_code = lower(trim(_code)) $$;

create table public.lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise exercise not null,
  weight_kg numeric(6,2) not null check (weight_kg >= 0 and weight_kg <= 600),
  reps int not null check (reps between 1 and 100),
  lifted_on date not null default current_date,
  description text check (char_length(description) <= 500),
  video_path text,
  status lift_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lifts(user_id);
create index on public.lifts(exercise, weight_kg desc);
grant select on public.lifts to anon, authenticated;
grant insert (user_id, exercise, weight_kg, reps, lifted_on, description, video_path) on public.lifts to authenticated;
grant update (description) on public.lifts to authenticated;
grant delete on public.lifts to authenticated;
grant all on public.lifts to service_role;
alter table public.lifts enable row level security;
create policy "lifts public read" on public.lifts for select using (status <> 'REJECTED' or user_id = auth.uid());
create policy "lifts own insert" on public.lifts for insert to authenticated with check (user_id = auth.uid());
create policy "lifts own update" on public.lifts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lifts own delete" on public.lifts for delete to authenticated using (user_id = auth.uid() and status <> 'VERIFIED');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_crews before update on public.crews for each row execute function public.touch_updated_at();
create trigger t_lifts before update on public.lifts for each row execute function public.touch_updated_at();

create or replace function public.leaderboard(_exercise exercise, _crew uuid default null, _since date default null)
returns table(user_id uuid, username text, display_name text, avatar_url text, weight_kg numeric, reps int, status lift_status, lift_id uuid, lifted_on date)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (l.user_id) l.user_id, p.username, p.display_name, p.avatar_url, l.weight_kg, l.reps, l.status, l.id, l.lifted_on
    from public.lifts l join public.profiles p on p.id = l.user_id
    where l.exercise = _exercise and l.status <> 'REJECTED'
      and (_crew is null or exists (select 1 from public.crew_members m where m.crew_id = _crew and m.user_id = l.user_id))
      and (_since is null or l.lifted_on >= _since)
    order by l.user_id, l.weight_kg desc, l.reps desc, l.lifted_on asc
  ) t order by t.weight_kg desc, t.reps desc limit 100 $$;
grant execute on function public.leaderboard(exercise, uuid, date) to anon, authenticated;

create policy "lift videos own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'lift-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lift videos signed-in read" on storage.objects for select to authenticated
  using (bucket_id = 'lift-videos');
create policy "lift videos own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lift-videos' and (storage.foldername(name))[1] = auth.uid()::text);