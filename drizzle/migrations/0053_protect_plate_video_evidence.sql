-- REPUNIT 0053: protect the dedicated plate-proof video from client-side replacement.
begin;
create or replace function public.protect_lift_verification_fields()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  authorized_review boolean :=
    coalesce(current_setting('repunit.admin_lift_review', true), '') = 'on'
    and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'moderator'));
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.exercise is distinct from old.exercise
      or new.weight_kg is distinct from old.weight_kg
      or new.reps is distinct from old.reps
      or new.lifted_on is distinct from old.lifted_on
      or new.video_path is distinct from old.video_path
      or new.plate_video_path is distinct from old.plate_video_path
      or (new.status is distinct from old.status and not authorized_review) then
      raise exception 'Submitted lift evidence and verification status cannot be changed directly' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
commit;
notify pgrst,'reload schema';
