-- REPUNIT 0020: likes and comments directly on lift evidence.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

create table if not exists public.lift_likes (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(lift_id, user_id)
);
create index if not exists lift_likes_lift_idx on public.lift_likes(lift_id, created_at desc);
alter table public.lift_likes enable row level security;
revoke all on public.lift_likes from anon, authenticated;
grant select, insert, delete on public.lift_likes to authenticated;
drop policy if exists "signed in users read lift likes" on public.lift_likes;
create policy "signed in users read lift likes" on public.lift_likes
for select to authenticated using (true);
drop policy if exists "users like lifts as themselves" on public.lift_likes;
create policy "users like lifts as themselves" on public.lift_likes
for insert to authenticated with check (
  user_id = auth.uid()
  and exists(select 1 from public.lifts l where l.id = lift_id and l.user_id <> auth.uid())
);
drop policy if exists "users remove own lift likes" on public.lift_likes;
create policy "users remove own lift likes" on public.lift_likes
for delete to authenticated using (user_id = auth.uid());

create table if not exists public.lift_comments (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists lift_comments_lift_created_idx on public.lift_comments(lift_id, created_at);
alter table public.lift_comments enable row level security;
revoke all on public.lift_comments from anon, authenticated;
grant select, insert, delete on public.lift_comments to authenticated;
drop policy if exists "signed in users read lift comments" on public.lift_comments;
create policy "signed in users read lift comments" on public.lift_comments
for select to authenticated using (true);
drop policy if exists "users comment on lifts as themselves" on public.lift_comments;
create policy "users comment on lifts as themselves" on public.lift_comments
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users delete own lift comments" on public.lift_comments;
create policy "users delete own lift comments" on public.lift_comments
for delete to authenticated using (user_id = auth.uid());

create or replace function public.repunit_notify_lift_engagement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lift_owner uuid;
  actor_name text;
  event_kind text;
  event_title text;
  event_body text;
begin
  select user_id into lift_owner from public.lifts where id = new.lift_id;
  select coalesce(display_name, username, 'A lifter') into actor_name
    from public.profiles where id = new.user_id;
  if tg_table_name = 'lift_likes' then
    event_kind := 'like';
    event_title := 'Someone liked your lift';
    event_body := coalesce(actor_name, 'A lifter') || ' liked your lift video.';
  else
    event_kind := 'comment';
    event_title := 'New lift comment';
    event_body := coalesce(actor_name, 'A lifter') || ' commented: ' || left(new.content, 400);
  end if;
  perform public.repunit_create_notification(lift_owner, new.user_id, event_kind, event_title, event_body, '/records/' || new.lift_id::text);
  return new;
end;
$$;

drop trigger if exists repunit_notify_lift_like on public.lift_likes;
create trigger repunit_notify_lift_like after insert on public.lift_likes
for each row execute function public.repunit_notify_lift_engagement();
drop trigger if exists repunit_notify_lift_comment on public.lift_comments;
create trigger repunit_notify_lift_comment after insert on public.lift_comments
for each row execute function public.repunit_notify_lift_engagement();

create or replace function public.repunit_award_lift_like_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare lift_owner uuid;
begin
  select user_id into lift_owner from public.lifts where id = new.lift_id;
  if lift_owner is not null and lift_owner <> new.user_id then
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    values(lift_owner, 5, 0, 0, null)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 5,
          updated_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists lift_likes_award_xp on public.lift_likes;
create trigger lift_likes_award_xp after insert on public.lift_likes
for each row execute function public.repunit_award_lift_like_xp();

commit;
notify pgrst, 'reload schema';
