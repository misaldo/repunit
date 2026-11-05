-- REPUNIT 0021: rotate weekly battles through bench, squat, deadlift and total volume.

begin;

create or replace function public.ensure_weekly_crew_battles(_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  monday date := date_trunc('week', now())::date;
  battle_category text;
begin
  if auth.uid() is null or not public.is_crew_member(_crew, auth.uid()) then
    raise exception 'Join this crew to view its battles';
  end if;
  perform pg_advisory_xact_lock(hashtext('repunit-weekly-crew-battles'));
  if exists(select 1 from public.crew_battles where is_weekly = true and week_start = monday) then
    return;
  end if;
  battle_category := case (extract(week from monday)::integer - 1) % 4
    when 0 then 'bench'
    when 1 then 'squat'
    when 2 then 'deadlift'
    else 'volume'
  end;
  with eligible as (
    select c.id, row_number() over(order by random()) as rn
    from public.crews c
    where (select count(*) from public.crew_members cm where cm.crew_id = c.id) >= 2
  ), pairs as (
    select a.id as left_id, b.id as right_id
    from eligible a join eligible b on b.rn = a.rn + 1
    where mod(a.rn, 2) = 1
  )
  insert into public.crew_battles(
    challenger_crew_id, opponent_crew_id, category, starts_at, ends_at,
    status, created_by, is_weekly, week_start
  )
  select p.left_id, p.right_id, battle_category,
    monday::timestamptz, (monday + 7)::timestamptz,
    'active', auth.uid(), true, monday
  from pairs p
  where not exists (
    select 1 from public.crew_battles b
    where b.is_weekly = true and b.week_start = monday
      and (b.challenger_crew_id in (p.left_id,p.right_id)
        or b.opponent_crew_id in (p.left_id,p.right_id))
  );
end;
$$;
grant execute on function public.ensure_weekly_crew_battles(uuid) to authenticated;

create or replace function public.challenge_crew(_challenger uuid, _opponent uuid, _category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare battle_id uuid; member record;
begin
  if auth.uid() is null then raise exception 'Sign in to challenge a crew'; end if;
  if _challenger = _opponent then raise exception 'Choose a different crew'; end if;
  if _category not in ('bench','squat','deadlift','volume') then raise exception 'Invalid battle category'; end if;
  if not exists(select 1 from public.crew_members where crew_id = _challenger and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only your crew admins can send challenges';
  end if;
  if not exists(select 1 from public.crews where id = _opponent) then raise exception 'Crew not found'; end if;
  insert into public.crew_battles(
    challenger_crew_id, opponent_crew_id, category, starts_at, ends_at,
    status, created_by, is_weekly
  ) values (_challenger, _opponent, _category, date_trunc('day',now()), date_trunc('day',now()) + interval '7 days', 'pending', auth.uid(), false)
  returning id into battle_id;
  for member in select user_id from public.crew_members where crew_id = _opponent loop
    perform public.repunit_create_notification(
      member.user_id, auth.uid(), 'battle', 'Crew challenge received',
      'Your crew has been challenged. Open the battle to accept or decline.',
      '/battles/' || battle_id::text
    );
  end loop;
  return battle_id;
end;
$$;
grant execute on function public.challenge_crew(uuid,uuid,text) to authenticated;

create or replace function public.respond_crew_battle(_battle uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  opponent uuid;
  challenger uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to respond'; end if;
  select opponent_crew_id, challenger_crew_id into opponent, challenger
  from public.crew_battles
  where id = _battle and status = 'pending'
  for update;
  if opponent is null then raise exception 'This challenge is no longer waiting for a response'; end if;
  if not exists(select 1 from public.crew_members where crew_id = opponent and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only the challenged crew admins can respond';
  end if;
  if _accept then
    update public.crew_battles
      set status = 'active', starts_at = date_trunc('day',now()), ends_at = date_trunc('day',now()) + interval '7 days'
      where id = _battle;
    insert into public.user_progress(user_id, xp, current_streak, longest_streak, last_activity_on)
    select distinct cm.user_id, 10, 0, 0, null
    from public.crew_members cm
    where cm.crew_id in (challenger, opponent)
    on conflict(user_id) do update
      set xp = public.user_progress.xp + 10,
          updated_at = now();
  else
    update public.crew_battles set status = 'cancelled' where id = _battle;
  end if;
end;
$$;
grant execute on function public.respond_crew_battle(uuid,boolean) to authenticated;

create or replace function public.complete_crew_battle(_battle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  left_total numeric := 0;
  right_total numeric := 0;
  winner uuid;
begin
  select * into b from public.crew_battles where id = _battle for update;
  if not found then raise exception 'Battle not found'; end if;
  if auth.uid() is null or not (
    public.is_crew_member(b.challenger_crew_id, auth.uid())
    or public.is_crew_member(b.opponent_crew_id, auth.uid())
  ) then raise exception 'Join one of the crews to finalize this battle'; end if;
  if b.status in ('completed','cancelled','pending') or now() < b.ends_at then return; end if;

  if b.category = 'volume' then
    select coalesce(sum(l.weight_kg * greatest(coalesce(l.reps,1),1)),0) into left_total
    from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
    where cm.crew_id = b.challenger_crew_id and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date;
    select coalesce(sum(l.weight_kg * greatest(coalesce(l.reps,1),1)),0) into right_total
    from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
    where cm.crew_id = b.opponent_crew_id and l.status = 'VERIFIED'
      and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date;
  else
    select coalesce(sum(best_weight),0) into left_total from (
      select max(l.weight_kg) as best_weight
      from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
      where cm.crew_id = b.challenger_crew_id and l.exercise::text = b.category
        and l.status = 'VERIFIED' and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date
      group by l.user_id
    ) scores;
    select coalesce(sum(best_weight),0) into right_total from (
      select max(l.weight_kg) as best_weight
      from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
      where cm.crew_id = b.opponent_crew_id and l.exercise::text = b.category
        and l.status = 'VERIFIED' and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date
      group by l.user_id
    ) scores;
  end if;

  if left_total > right_total then winner := b.challenger_crew_id;
  elsif right_total > left_total then winner := b.opponent_crew_id;
  else winner := null; end if;

  update public.crew_battles set status = 'completed', winner_crew_id = winner where id = _battle;
  if winner is not null then
    insert into public.crew_achievements(crew_id, achievement_key)
    values(winner, 'crew_battle_winner:' || _battle::text)
    on conflict(crew_id, achievement_key) do nothing;
  end if;
end;
$$;
grant execute on function public.complete_crew_battle(uuid) to authenticated;

-- Generate the weekly pairings without requiring a user to open a Crew page.
create or replace function public.repunit_generate_weekly_crew_battles()
returns integer language plpgsql security definer set search_path = public as $$
declare
  monday date := date_trunc('week', now())::date;
  battle_category text;
  inserted_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('repunit-weekly-crew-battles'));
  if exists(select 1 from public.crew_battles where is_weekly = true and week_start = monday) then
    return 0;
  end if;
  battle_category := case (extract(week from monday)::integer - 1) % 4
    when 0 then 'bench' when 1 then 'squat' when 2 then 'deadlift' else 'volume' end;

  with eligible as (
    select c.id, c.owner_id, row_number() over(order by random()) as rn
    from public.crews c
    where c.owner_id is not null
      and (select count(*) from public.crew_members cm where cm.crew_id = c.id) >= 2
  ), pairs as (
    select a.id as left_id, b.id as right_id, a.owner_id as created_by
    from eligible a join eligible b on b.rn = a.rn + 1
    where mod(a.rn, 2) = 1
  )
  insert into public.crew_battles(
    challenger_crew_id, opponent_crew_id, category, starts_at, ends_at,
    status, created_by, is_weekly, week_start
  )
  select p.left_id, p.right_id, battle_category, monday::timestamptz,
         (monday + 7)::timestamptz, 'active', p.created_by, true, monday
  from pairs p
  where not exists (
    select 1 from public.crew_battles b
    where b.is_weekly = true and b.week_start = monday
      and (b.challenger_crew_id in (p.left_id,p.right_id)
        or b.opponent_crew_id in (p.left_id,p.right_id))
  );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.repunit_generate_weekly_crew_battles() from public, anon, authenticated;
grant execute on function public.repunit_generate_weekly_crew_battles() to service_role;

-- Finalize expired weekly and accepted battles even if no member opens the app.
create or replace function public.repunit_finalize_expired_crew_battles()
returns integer language plpgsql security definer set search_path = public as $$
declare
  b record;
  left_total numeric;
  right_total numeric;
  winner uuid;
  finalized_count integer := 0;
begin
  update public.crew_battles
    set status = 'cancelled'
    where status = 'pending' and ends_at <= now();

  for b in
    select * from public.crew_battles
    where status in ('scheduled','active') and ends_at <= now()
    for update skip locked
  loop
    left_total := 0;
    right_total := 0;
    winner := null;

    if b.category = 'volume' then
      select coalesce(sum(l.weight_kg * greatest(coalesce(l.reps,1),1)),0) into left_total
      from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
      where cm.crew_id = b.challenger_crew_id and l.status = 'VERIFIED'
        and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date;
      select coalesce(sum(l.weight_kg * greatest(coalesce(l.reps,1),1)),0) into right_total
      from public.lifts l join public.crew_members cm on cm.user_id = l.user_id
      where cm.crew_id = b.opponent_crew_id and l.status = 'VERIFIED'
        and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date;
    else
      select coalesce(sum(best_weight),0) into left_total from (
        select max(l.weight_kg) as best_weight from public.lifts l
        join public.crew_members cm on cm.user_id = l.user_id
        where cm.crew_id = b.challenger_crew_id and l.exercise::text = b.category
          and l.status = 'VERIFIED' and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date
        group by l.user_id
      ) scores;
      select coalesce(sum(best_weight),0) into right_total from (
        select max(l.weight_kg) as best_weight from public.lifts l
        join public.crew_members cm on cm.user_id = l.user_id
        where cm.crew_id = b.opponent_crew_id and l.exercise::text = b.category
          and l.status = 'VERIFIED' and l.lifted_on >= b.starts_at::date and l.lifted_on < b.ends_at::date
        group by l.user_id
      ) scores;
    end if;

    if left_total > right_total then winner := b.challenger_crew_id;
    elsif right_total > left_total then winner := b.opponent_crew_id;
    end if;

    update public.crew_battles
      set status = 'completed', winner_crew_id = winner
      where id = b.id;

    if winner is not null then
      insert into public.crew_achievements(crew_id, achievement_key)
      values(winner, 'crew_battle_winner:' || b.id::text)
      on conflict(crew_id, achievement_key) do nothing;
    end if;
    finalized_count := finalized_count + 1;
  end loop;
  return finalized_count;
end;
$$;
revoke all on function public.repunit_finalize_expired_crew_battles() from public, anon, authenticated;
grant execute on function public.repunit_finalize_expired_crew_battles() to service_role;

-- pg_cron is optional on Supabase projects; the app still has an on-visit fallback.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    if not exists(select 1 from cron.job where jobname = 'repunit-weekly-crew-battles') then
      perform cron.schedule('repunit-weekly-crew-battles', '0 0 * * 1', 'select public.repunit_generate_weekly_crew_battles()');
    end if;
    if not exists(select 1 from cron.job where jobname = 'repunit-finalize-crew-battles') then
      perform cron.schedule('repunit-finalize-crew-battles', '*/15 * * * *', 'select public.repunit_finalize_expired_crew_battles()');
    end if;
  end if;
exception when undefined_table or undefined_function or insufficient_privilege then
  raise notice 'pg_cron is unavailable; crew battles will use the on-visit fallback.';
end;
$$;

commit;
notify pgrst, 'reload schema';
