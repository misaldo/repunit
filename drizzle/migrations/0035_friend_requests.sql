-- REPUNIT 0035: explicit friend requests, accepted friendships and friend-only SPLIT access.
-- Follows remain separate. Accepting a friend request does not auto-follow either user.

begin;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (requester_id <> recipient_id),
  constraint friend_requests_pair_unique unique (requester_id, recipient_id)
);

create index if not exists friend_requests_recipient_status_idx
  on public.friend_requests(recipient_id, status, created_at desc);
create index if not exists friend_requests_requester_status_idx
  on public.friend_requests(requester_id, status, created_at desc);

alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from anon, authenticated;
grant select on public.friend_requests to authenticated;
drop policy if exists "participants read friend requests" on public.friend_requests;
create policy "participants read friend requests"
on public.friend_requests for select to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid());

create or replace function public.are_friends(_left uuid, _right uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.requester_id = _left and fr.recipient_id = _right)
        or (fr.requester_id = _right and fr.recipient_id = _left)
      )
  );
$$;
revoke all on function public.are_friends(uuid,uuid) from public, anon;
grant execute on function public.are_friends(uuid,uuid) to authenticated;

create or replace function public.friendship_status(_other uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null or _other is null or me = _other then
    return jsonb_build_object('is_friend', false, 'outgoing_request_id', null, 'incoming_request_id', null);
  end if;
  return jsonb_build_object(
    'is_friend', public.are_friends(me, _other),
    'outgoing_request_id', (
      select id from public.friend_requests
      where requester_id = me and recipient_id = _other and status = 'pending'
      limit 1
    ),
    'incoming_request_id', (
      select id from public.friend_requests
      where requester_id = _other and recipient_id = me and status = 'pending'
      limit 1
    )
  );
end;
$$;
revoke all on function public.friendship_status(uuid) from public, anon;
grant execute on function public.friendship_status(uuid) to authenticated;

create or replace function public.send_friend_request(_recipient uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  request_id uuid;
  existing_status text;
  actor_name text;
begin
  if me is null then raise exception 'Sign in to add a friend'; end if;
  if _recipient is null or _recipient = me then raise exception 'Choose another lifter'; end if;
  if not exists (select 1 from public.profiles where id = _recipient) then raise exception 'Lifter not found'; end if;
  if public.are_friends(me, _recipient) then raise exception 'You are already friends'; end if;

  if exists (
    select 1 from public.friend_requests
    where requester_id = _recipient and recipient_id = me and status = 'pending'
  ) then
    raise exception 'This lifter has already sent you a request. Accept it from your requests.';
  end if;

  select id, status into request_id, existing_status
  from public.friend_requests
  where requester_id = me and recipient_id = _recipient;

  if existing_status = 'pending' then return request_id; end if;
  if request_id is null then
    insert into public.friend_requests(requester_id, recipient_id)
    values (me, _recipient)
    returning id into request_id;
  else
    update public.friend_requests
      set status = 'pending', created_at = now(), responded_at = null
      where id = request_id;
  end if;

  select coalesce(display_name, username, 'A lifter') into actor_name
  from public.profiles where id = me;
  perform public.repunit_create_notification(
    _recipient, me, 'system', 'Friend request',
    coalesce(actor_name, 'A lifter') || ' sent you a friend request.',
    '/people?tab=requests'
  );
  return request_id;
end;
$$;
revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(_request uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender uuid;
  actor_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to respond'; end if;
  update public.friend_requests
    set status = case when _accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = _request
      and recipient_id = auth.uid()
      and status = 'pending'
    returning requester_id into sender;
  if sender is null then raise exception 'This friend request is no longer waiting'; end if;

  if _accept then
    select coalesce(display_name, username, 'A lifter') into actor_name
    from public.profiles where id = auth.uid();
    perform public.repunit_create_notification(
      sender, auth.uid(), 'system', 'Friend request accepted',
      coalesce(actor_name, 'A lifter') || ' accepted your friend request.',
      '/u/' || (select username from public.profiles where id = auth.uid())
    );
  end if;
end;
$$;
revoke all on function public.respond_friend_request(uuid,boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;

create or replace function public.remove_friend(_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to manage friends'; end if;
  delete from public.friend_requests
  where status = 'accepted'
    and (
      (requester_id = auth.uid() and recipient_id = _other)
      or (requester_id = _other and recipient_id = auth.uid())
    );
end;
$$;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Only accepted friends can send one-to-one challenges.
drop policy if exists "users create challenges" on public.lifter_challenges;
create policy "friends create challenges"
on public.lifter_challenges for insert to authenticated
with check (
  challenger_id = auth.uid()
  and public.are_friends(challenger_id, challenged_id)
);

-- Friend call-outs now use accepted friend requests, not mutual follows.
create or replace function public.create_friend_lift_callouts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'VERIFIED'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.weight_kg < 600 then
    insert into public.lifter_challenges(
      challenger_id, challenged_id, exercise, target_weight_kg, source_lift_id, due_at
    )
    select new.user_id,
      case when fr.requester_id = new.user_id then fr.recipient_id else fr.requester_id end,
      new.exercise, least(new.weight_kg + 2.5, 600), new.id, now() + interval '7 days'
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.requester_id = new.user_id or fr.recipient_id = new.user_id);
  end if;
  return new;
end;
$$;

-- Friends-only SPLIT visibility uses accepted friendships; public/private behavior is unchanged.
drop policy if exists "workout plans readable by visibility" on public.workout_plans;
create policy "workout plans readable by visibility"
on public.workout_plans for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'followers' and public.are_friends(auth.uid(), workout_plans.user_id))
);

drop policy if exists "exercises readable with plan" on public.workout_plan_exercises;
create policy "exercises readable with plan"
on public.workout_plan_exercises for select to authenticated
using (
  exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_exercises.plan_id
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (p.visibility = 'followers' and public.are_friends(auth.uid(), p.user_id))
      )
  )
);

notify pgrst, 'reload schema';
commit;
