-- REPUNIT social dependencies required by workout visibility and XP triggers.
-- Run this once after 0000_migration.sql and before 0001_workouts_challenges_security.sql.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows(following_id, created_at desc);
alter table public.follows enable row level security;
grant select, insert, delete on public.follows to authenticated;
drop policy if exists "follows visible to signed in users" on public.follows;
create policy "follows visible to signed in users" on public.follows for select to authenticated using (true);
drop policy if exists "users follow as themselves" on public.follows;
create policy "users follow as themselves" on public.follows for insert to authenticated with check (follower_id = auth.uid() and follower_id <> following_id);
drop policy if exists "users unfollow as themselves" on public.follows;
create policy "users unfollow as themselves" on public.follows for delete to authenticated using (follower_id = auth.uid());

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_id uuid references public.lifts(id) on delete set null,
  content text check (char_length(content) <= 2000),
  media_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);
alter table public.posts enable row level security;
grant select, insert, update, delete on public.posts to authenticated;
drop policy if exists "posts readable by signed in users" on public.posts;
create policy "posts readable by signed in users" on public.posts for select to authenticated using (true);
drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts" on public.posts for delete to authenticated using (user_id = auth.uid());

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists likes_post_idx on public.likes(post_id, created_at desc);
alter table public.likes enable row level security;
grant select, insert, delete on public.likes to authenticated;
drop policy if exists "likes readable by signed in users" on public.likes;
create policy "likes readable by signed in users" on public.likes for select to authenticated using (true);
drop policy if exists "users like as themselves" on public.likes;
create policy "users like as themselves" on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users unlike as themselves" on public.likes;
create policy "users unlike as themselves" on public.likes for delete to authenticated using (user_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at);
alter table public.comments enable row level security;
grant select, insert, delete on public.comments to authenticated;
drop policy if exists "comments readable by signed in users" on public.comments;
create policy "comments readable by signed in users" on public.comments for select to authenticated using (true);
drop policy if exists "users create own comments" on public.comments;
create policy "users create own comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());
