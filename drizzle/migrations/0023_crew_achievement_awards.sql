-- REPUNIT 0023: award meaningful Crew badges automatically.

begin;

-- Backfill badges for existing Crews.
insert into public.crew_achievements(crew_id, achievement_key)
select cm.crew_id, 'iron_squad'
from public.crew_members cm
group by cm.crew_id
having count(*) >= 5
on conflict(crew_id, achievement_key) do nothing;

insert into public.crew_achievements(crew_id, achievement_key)
select cm.crew_id, '100_ton_club'
from public.crew_members cm
join public.lifts l on l.user_id = cm.user_id and l.status = 'VERIFIED'
group by cm.crew_id
having sum(l.weight_kg * greatest(coalesce(l.reps,1),1)) >= 100000
on conflict(crew_id, achievement_key) do nothing;

insert into public.crew_achievements(crew_id, achievement_key)
select distinct winner_crew_id, 'weekly_winners'
from public.crew_battles
where status = 'completed' and is_weekly = true and winner_crew_id is not null
on conflict(crew_id, achievement_key) do nothing;

create or replace function public.repunit_award_crew_size_badge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.crew_members where crew_id = new.crew_id) >= 5 then
    insert into public.crew_achievements(crew_id, achievement_key)
    values(new.crew_id, 'iron_squad')
    on conflict(crew_id, achievement_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists crew_members_award_iron_squad on public.crew_members;
create trigger crew_members_award_iron_squad
after insert on public.crew_members
for each row execute function public.repunit_award_crew_size_badge();

create or replace function public.repunit_award_crew_volume_badge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  crew record;
  total_volume numeric;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  for crew in select crew_id from public.crew_members where user_id = new.user_id loop
    select coalesce(sum(l.weight_kg * greatest(coalesce(l.reps,1),1)),0)
      into total_volume
    from public.lifts l
    join public.crew_members cm on cm.user_id = l.user_id
    where cm.crew_id = crew.crew_id and l.status = 'VERIFIED';

    if total_volume >= 100000 then
      insert into public.crew_achievements(crew_id, achievement_key)
      values(crew.crew_id, '100_ton_club')
      on conflict(crew_id, achievement_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists lifts_award_crew_volume_badge on public.lifts;
create trigger lifts_award_crew_volume_badge
after insert or update of status on public.lifts
for each row execute function public.repunit_award_crew_volume_badge();

commit;
notify pgrst, 'reload schema';
