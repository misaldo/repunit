-- Public crew discovery and safe joining from crew profile pages.
alter table public.crews add column if not exists is_public boolean not null default false;
grant select (is_public) on public.crews to authenticated;

create or replace function public.set_crew_visibility(_crew uuid, _public boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.crew_members
    where crew_id=_crew and user_id=auth.uid() and role='admin'
  ) then raise exception 'Only crew admins can change visibility'; end if;
  update public.crews set is_public=_public where id=_crew;
end $$;
grant execute on function public.set_crew_visibility(uuid,boolean) to authenticated;

create or replace function public.join_public_crew(_crew uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare cap integer; current_count integer; is_open boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join a crew'; end if;
  select max_members,is_public into cap,is_open from public.crews where id=_crew for update;
  if cap is null then raise exception 'Crew not found'; end if;
  if not is_open then raise exception 'This crew is private'; end if;
  if exists(select 1 from public.crew_members where crew_id=_crew and user_id=auth.uid()) then return _crew; end if;
  select count(*) into current_count from public.crew_members where crew_id=_crew;
  if current_count>=cap then raise exception 'This crew is full'; end if;
  insert into public.crew_members(crew_id,user_id,role) values(_crew,auth.uid(),'member');
  return _crew;
end $$;
grant execute on function public.join_public_crew(uuid) to authenticated;
