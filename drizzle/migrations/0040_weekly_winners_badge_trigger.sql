-- REPUNIT 0040: award the persistent Weekly Winners Crew badge after every weekly win.

begin;

insert into public.crew_achievements(crew_id, achievement_key)
select distinct winner_crew_id, 'weekly_winners'
from public.crew_battles
where is_weekly = true and status = 'completed' and winner_crew_id is not null
on conflict (crew_id, achievement_key) do nothing;

create or replace function public.repunit_award_weekly_winner_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_weekly = true
     and new.status = 'completed'
     and new.winner_crew_id is not null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.winner_crew_id is distinct from new.winner_crew_id
     ) then
    insert into public.crew_achievements(crew_id, achievement_key)
    values(new.winner_crew_id, 'weekly_winners')
    on conflict (crew_id, achievement_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists crew_battles_award_weekly_winners on public.crew_battles;
create trigger crew_battles_award_weekly_winners
after insert or update of status, winner_crew_id on public.crew_battles
for each row execute function public.repunit_award_weekly_winner_badge();

commit;
