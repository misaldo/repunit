-- REPUNIT 0015: notification preferences, event notifications and web-push subscriptions.
-- Safe to run repeatedly in Supabase SQL Editor.

begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lift boolean not null default true,
  pr boolean not null default true,
  like boolean not null default true,
  comment boolean not null default true,
  challenge boolean not null default true,
  rank boolean not null default true,
  battle boolean not null default true,
  streak boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
grant select, insert, update on public.notification_preferences to authenticated;
drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists "users insert own notification preferences" on public.notification_preferences;
create policy "users insert own notification preferences" on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences" on public.notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions" on public.push_subscriptions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.repunit_notification_enabled(_user uuid, _kind text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare enabled_value boolean;
begin
  if _kind = 'system' then return true; end if;
  if _kind not in ('lift','pr','like','comment','challenge','rank','battle','streak') then return false; end if;
  insert into public.notification_preferences(user_id) values (_user) on conflict (user_id) do nothing;
  execute format('select %I from public.notification_preferences where user_id = $1', _kind)
    into enabled_value using _user;
  return coalesce(enabled_value, true);
end;
$$;

create or replace function public.repunit_create_notification(
  _recipient uuid, _actor uuid, _kind text, _title text, _body text, _href text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if _recipient is null or _recipient = _actor then return; end if;
  if not public.repunit_notification_enabled(_recipient, _kind) then return; end if;
  insert into public.notifications(user_id, actor_id, kind, title, body, href)
  values (_recipient, _actor, _kind, left(_title,120), left(_body,500), _href);
end;
$$;

-- Notify mutual friends when a new lift is logged. A verified personal best also gets a PR alert.
create or replace function public.repunit_notify_lift_friends()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  friend record;
  previous_best numeric;
  is_pr boolean := false;
  actor_name text;
  lift_label text;
begin
  select coalesce(display_name, username, 'A friend') into actor_name
  from public.profiles where id = new.user_id;
  lift_label := case new.exercise::text
    when 'bench' then 'bench press'
    when 'squat' then 'squat'
    when 'deadlift' then 'deadlift'
    when 'ohp' then 'overhead press'
    when 'pullup' then 'pull-up'
    else new.exercise::text end;

  if new.status = 'VERIFIED' then
    select max(weight_kg) into previous_best
    from public.lifts
    where user_id = new.user_id and exercise = new.exercise
      and status = 'VERIFIED' and id <> new.id;
    is_pr := previous_best is null or new.weight_kg > previous_best;
  end if;

  for friend in
    select distinct f.follower_id as user_id
    from public.follows f
    where f.following_id = new.user_id
      and f.follower_id <> new.user_id
      and exists (
        select 1 from public.follows mutual
        where mutual.follower_id = new.user_id and mutual.following_id = f.follower_id
      )
  loop
    if tg_op = 'INSERT' then
      perform public.repunit_create_notification(
        friend.user_id, new.user_id, 'lift', 'A friend logged a lift',
        actor_name || ' logged ' || new.weight_kg::text || ' kg ' || lift_label || '.',
        '/u/' || (select username from public.profiles where id = new.user_id)
      );
    end if;
    if is_pr then
      perform public.repunit_create_notification(
        friend.user_id, new.user_id, 'pr', 'New personal record',
        actor_name || ' just hit a new ' || lift_label || ' PR: ' || new.weight_kg::text || ' kg.',
        '/u/' || (select username from public.profiles where id = new.user_id)
      );
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists repunit_notify_lift_friends on public.lifts;
create trigger repunit_notify_lift_friends after insert or update of status on public.lifts
for each row execute function public.repunit_notify_lift_friends();

-- Notify the previous #1 when a verified lift takes the top spot in that exercise.
create or replace function public.repunit_notify_rank_takeover()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous_top record;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  select l.user_id, p.username, l.weight_kg
    into previous_top
  from public.lifts l join public.profiles p on p.id = l.user_id
  where l.exercise = new.exercise and l.status = 'VERIFIED'
    and l.id <> new.id
  order by l.weight_kg desc, l.reps desc, l.lifted_on asc
  limit 1;
  if previous_top.user_id is not null and previous_top.user_id <> new.user_id and new.weight_kg > previous_top.weight_kg then
    perform public.repunit_create_notification(
      previous_top.user_id, new.user_id, 'rank', 'You lost the #1 spot',
      coalesce((select display_name from public.profiles where id = new.user_id),
               (select username from public.profiles where id = new.user_id), 'A lifter')
        || ' just took the #1 ' || new.exercise::text || ' spot with ' || new.weight_kg::text || ' kg.',
      '/leaderboards'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists repunit_notify_rank_takeover on public.lifts;
create trigger repunit_notify_rank_takeover after insert or update of status on public.lifts
for each row when (new.status = 'VERIFIED')
execute function public.repunit_notify_rank_takeover();

-- Notify all members of both crews when a battle starts or ends.
create or replace function public.repunit_notify_battle_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  member record;
  left_name text;
  right_name text;
  event_title text;
  event_body text;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('active','completed') then return new; end if;
  elsif old.status is not distinct from new.status then
    return new;
  elsif new.status not in ('active','completed') then
    return new;
  end if;

  select name into left_name from public.crews where id = new.challenger_crew_id;
  select name into right_name from public.crews where id = new.opponent_crew_id;
  if new.status = 'active' then
    event_title := 'Battle started';
    event_body := coalesce(left_name,'A crew') || ' vs ' || coalesce(right_name,'a crew') || ' is live.';
  else
    event_title := 'Battle ended';
    event_body := coalesce(left_name,'A crew') || ' vs ' || coalesce(right_name,'a crew') || ' has finished.';
  end if;

  for member in
    select distinct user_id from public.crew_members
    where crew_id in (new.challenger_crew_id,new.opponent_crew_id)
  loop
    perform public.repunit_create_notification(member.user_id, null, 'battle', event_title, event_body, '/battles/' || new.id::text);
  end loop;
  return new;
end;
$$;
drop trigger if exists repunit_notify_battle_status on public.crew_battles;
create trigger repunit_notify_battle_status after insert or update of status on public.crew_battles
for each row execute function public.repunit_notify_battle_status();

-- Notify post owners when another lifter likes or comments on their posts.
create or replace function public.repunit_notify_post_engagement()
returns trigger language plpgsql security definer set search_path = public as $
declare
  post_owner uuid;
  actor_name text;
  event_kind text;
  event_title text;
  event_body text;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  select coalesce(display_name, username, 'A lifter') into actor_name from public.profiles where id = new.user_id;
  if tg_table_name = 'likes' then
    event_kind := 'like';
    event_title := 'Someone liked your post';
    event_body := coalesce(actor_name, 'A lifter') || ' liked your post.';
  else
    event_kind := 'comment';
    event_title := 'New comment';
    event_body := coalesce(actor_name, 'A lifter') || ' commented: ' || left(new.content, 400);
  end if;
  perform public.repunit_create_notification(post_owner, new.user_id, event_kind, event_title, event_body, '/feed');
  return new;
end;
$;
drop trigger if exists repunit_notify_post_like on public.likes;
create trigger repunit_notify_post_like after insert on public.likes
for each row execute function public.repunit_notify_post_engagement();
drop trigger if exists repunit_notify_post_comment on public.comments;
create trigger repunit_notify_post_comment after insert on public.comments
for each row execute function public.repunit_notify_post_engagement();

-- Daily streak-loss check. pg_cron schedules this when the extension is available.
create or replace function public.repunit_check_streak_losses()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer := 0; item record;
begin
  for item in
    select up.user_id, up.current_streak, up.last_activity_on
    from public.user_progress up
    where up.current_streak > 0
      and up.last_activity_on < current_date - 1
  loop
    if public.repunit_notification_enabled(item.user_id, 'streak') then
      insert into public.notifications(user_id, kind, title, body, href)
      select item.user_id, 'streak', 'Your streak ended',
        'Your ' || item.current_streak::text || '-day training streak has ended. Start a new one today.',
        '/dashboard'
      where not exists (
        select 1 from public.notifications n
        where n.user_id = item.user_id and n.kind = 'streak'
          and n.created_at::date = current_date
          and n.title = 'Your streak ended'
      );
      if found then
        update public.user_progress set current_streak = 0, updated_at = now() where user_id = item.user_id;
        affected := affected + 1;
      end if;
    end if;
  end loop;
  return affected;
end;
$$;
grant execute on function public.repunit_check_streak_losses() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('repunit-daily-streak-check')
      where exists (select 1 from cron.job where jobname = 'repunit-daily-streak-check');
    perform cron.schedule('repunit-daily-streak-check', '5 0 * * *',
      'select public.repunit_check_streak_losses();');
  end if;
exception when others then
  raise notice 'pg_cron unavailable; streak-loss notifications need a daily scheduler.';
end $$;

-- Enable realtime delivery for the in-app notification center.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- Keep challenge notifications under the same per-type preference switch.
create or replace function public.notify_lifter_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  select coalesce(display_name, username) into actor_name
  from public.profiles where id = new.challenger_id;
  perform public.repunit_create_notification(
    new.challenged_id, new.challenger_id, 'challenge', 'You got called out',
    coalesce(actor_name, 'A friend') || ' challenged you to ' || new.target_weight_kg::text || ' kg. Can you beat it?',
    '/challenges'
  );
  return new;
end;
$$;

-- Internal security-definer helpers must only be callable by trusted trigger functions.
revoke all on function public.repunit_notification_enabled(uuid,text) from public, anon, authenticated;
revoke all on function public.repunit_create_notification(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.repunit_check_streak_losses() from public, anon, authenticated;
grant execute on function public.repunit_check_streak_losses() to service_role;

commit;
notify pgrst, 'reload schema';
