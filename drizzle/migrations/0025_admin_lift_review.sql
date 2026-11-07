-- REPUNIT 0025: secure manual lift review for the MVP.
-- Only admins can list pending video submissions and approve/reject them.
-- Approval changes status to VERIFIED, allowing the existing XP, achievement,
-- throne and battle triggers to run unchanged.

begin;

-- Keep direct client updates blocked, but allow the guarded admin RPC to change
-- status. The RPC sets this transaction-local flag only after has_role succeeds.
create or replace function public.protect_lift_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_review boolean :=
    coalesce(current_setting('repunit.admin_lift_review', true), '') = 'on'
    and public.has_role(auth.uid(), 'admin');
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or new.video_path is distinct from old.video_path
      or (new.status is distinct from old.status and not admin_review) then
      raise exception 'Submitted lift evidence and verification status cannot be changed directly'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_list_pending_lifts()
returns setof public.lifts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can view pending lifts' using errcode = '42501';
  end if;

  return query
    select l.*
    from public.lifts l
    where l.status = 'PENDING'
      and l.video_path is not null
      and btrim(l.video_path) <> ''
    order by l.created_at asc;
end;
$$;

create or replace function public.admin_review_lift(_lift_id uuid, _decision text)
returns public.lifts
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed_lift public.lifts;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can review lifts' using errcode = '42501';
  end if;

  if _decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;

  perform set_config('repunit.admin_lift_review', 'on', true);

  update public.lifts
  set status = case when _decision = 'approve'
    then 'VERIFIED'::public.lift_status
    else 'REJECTED'::public.lift_status
  end
  where id = _lift_id
    and status = 'PENDING'
    and video_path is not null
    and btrim(video_path) <> ''
  returning * into reviewed_lift;

  perform set_config('repunit.admin_lift_review', 'off', true);

  if not found then
    raise exception 'Pending lift with uploaded video was not found'
      using errcode = 'P0002';
  end if;

  return reviewed_lift;
end;
$$;

revoke all on function public.admin_list_pending_lifts() from public, anon;
revoke all on function public.admin_review_lift(uuid, text) from public, anon;
grant execute on function public.admin_list_pending_lifts() to authenticated;
grant execute on function public.admin_review_lift(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
