-- Crew upgrade: admin role, enforceable capacity, and admin controls.
alter table public.crews add column if not exists max_members integer not null default 20;
alter table public.crews drop constraint if exists crews_max_members_check;
alter table public.crews add constraint crews_max_members_check check (max_members between 2 and 100);
alter table public.crew_members drop constraint if exists crew_members_role_check;
update public.crew_members set role = 'admin' where role = 'owner';
alter table public.crew_members add constraint crew_members_role_check check (role in ('admin','member'));
create or replace function public.add_owner_member() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.crew_members(crew_id,user_id,role) values (new.id,new.owner_id,'admin'); return new; end $$;
grant select (max_members) on public.crews to authenticated;
grant insert (max_members) on public.crews to authenticated;
grant update (max_members) on public.crews to authenticated;
create or replace function public.join_crew(_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid; cap integer; current_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in to join a crew'; end if;
 select id,max_members into c,cap from public.crews where invite_code=lower(trim(_code)) for update;
 if c is null then raise exception 'Invalid invite code'; end if;
 if exists(select 1 from public.crew_members where crew_id=c and user_id=auth.uid()) then return c; end if;
 select count(*) into current_count from public.crew_members where crew_id=c;
 if current_count>=cap then raise exception 'This crew is full'; end if;
 insert into public.crew_members(crew_id,user_id,role) values(c,auth.uid(),'member'); return c;
end $$;
create or replace function public.update_crew_capacity(_crew uuid,_max_members integer) returns void language plpgsql security definer set search_path=public as $$
declare current_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.crew_members where crew_id=_crew and user_id=auth.uid() and role='admin') then raise exception 'Only crew admins can change settings'; end if;
 if _max_members<2 or _max_members>100 then raise exception 'Capacity must be between 2 and 100'; end if;
 select count(*) into current_count from public.crew_members where crew_id=_crew;
 if _max_members<current_count then raise exception 'Capacity cannot be lower than the current member count'; end if;
 update public.crews set max_members=_max_members where id=_crew;
end $$;
grant execute on function public.update_crew_capacity(uuid,integer) to authenticated;
create or replace function public.remove_crew_member(_crew uuid,_member uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.crew_members where crew_id=_crew and user_id=auth.uid() and role='admin') then raise exception 'Only crew admins can remove members'; end if;
 if _member=auth.uid() then raise exception 'Admins cannot remove themselves'; end if;
 delete from public.crew_members where crew_id=_crew and user_id=_member and role<>'admin';
end $$;
grant execute on function public.remove_crew_member(uuid,uuid) to authenticated;
create or replace function public.rotate_crew_invite(_crew uuid) returns text language plpgsql security definer set search_path=public as $$
declare new_code text;
begin
 if auth.uid() is null or not exists(select 1 from public.crew_members where crew_id=_crew and user_id=auth.uid() and role='admin') then raise exception 'Only crew admins can refresh invites'; end if;
 new_code:=encode(extensions.gen_random_bytes(6),'hex');
 update public.crews set invite_code=new_code where id=_crew; return new_code;
end $$;
grant execute on function public.rotate_crew_invite(uuid) to authenticated;
