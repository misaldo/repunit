-- 10,000 profiles, 100 crews, and 200,000 verified lifts.
insert into public.profiles(id,username,display_name,country_code)
select (substr(md5(g::text),1,8)||'-'||substr(md5(g::text),9,4)||'-4'||substr(md5(g::text),14,3)||'-a'||substr(md5(g::text),18,3)||'-'||substr(md5(g::text),21,12))::uuid,
       'lifter_'||g, 'Lifter '||g, case when g%2=0 then 'CZ' else 'US' end
from generate_series(1,10000) g;
insert into public.crews(id,name,is_public)
select (substr(md5(('crew'||g)::text),1,8)||'-'||substr(md5(('crew'||g)::text),9,4)||'-4'||substr(md5(('crew'||g)::text),14,3)||'-a'||substr(md5(('crew'||g)::text),18,3)||'-'||substr(md5(('crew'||g)::text),21,12))::uuid,
       'Crew '||g, true
from generate_series(1,100) g;
insert into public.crew_members(crew_id,user_id,role)
select c.id,p.id,'member'
from (
  select id, row_number() over(order by username) as member_number
  from public.profiles
) p
join public.crews c on c.name = 'Crew '||(((p.member_number-1)%100)+1);
insert into public.lifts(id,user_id,exercise,weight_kg,reps,lifted_on,video_path,status)
select (substr(md5((p.username||':'||n)::text),1,8)||'-'||substr(md5((p.username||':'||n)::text),9,4)||'-4'||substr(md5((p.username||':'||n)::text),14,3)||'-a'||substr(md5((p.username||':'||n)::text),18,3)||'-'||substr(md5((p.username||':'||n)::text),21,12))::uuid,
       p.id,
       (array['bench','squat','deadlift']::public.lift_exercise[])[((n-1)%3)+1],
       60 + (n*3) + (row_number() over(order by p.username)-1)%120,
       1 + (n%8),
       date '2025-01-01' + n,
       case when n%2=0 then 'video/'||p.username else null end,
       'VERIFIED'
from public.profiles p
cross join generate_series(1,20) n;

-- A deliberately spectacular unverified lift must never enter TOP.
insert into public.lifts(id,user_id,exercise,weight_kg,reps,lifted_on,video_path,status)
select '00000000-0000-4000-a000-000000000001'::uuid, id, 'bench', 9999, 1, date '2026-01-01', null, 'PENDING'
from public.profiles where username = 'lifter_1';

ANALYZE public.profiles;
ANALYZE public.crews;
ANALYZE public.crew_members;
ANALYZE public.lifts;

VACUUM (ANALYZE) public.profiles;
VACUUM (ANALYZE) public.crews;
VACUUM (ANALYZE) public.crew_members;
VACUUM (ANALYZE) public.lifts;
