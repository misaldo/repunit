-- REPUNIT: expanded achievement engine (140+ lifetime achievements).
-- Enable live client notifications for newly unlocked achievements when Supabase Realtime is available.
do $
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_achievements') then
    alter publication supabase_realtime add table public.user_achievements;
  end if;
end $;
-- All criteria use verified lifts only. Each unlock is unique and awards 10 bonus XP.
create or replace function public.award_lift_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_volume numeric;
  total_sessions integer;
  total_reps bigint;
  exercise_count integer;
  training_days integer;
  best_weight numeric;
  streak integer;
  achievement_key text;
  threshold integer;
  earned boolean;
begin
  if new.status <> 'VERIFIED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'VERIFIED' then return new; end if;

  select count(*), coalesce(sum(weight_kg * reps),0), coalesce(sum(reps),0), count(distinct exercise), count(distinct lifted_on)
    into total_sessions,total_volume,total_reps,exercise_count,training_days
  from public.lifts where user_id=new.user_id and status='VERIFIED';

  select coalesce(current_streak,0) into streak from public.user_progress where user_id=new.user_id;
  streak := coalesce(streak,0);

  foreach achievement_key in array array[
    'first_pr',
    'bench_100',
    'sessions_1',
    'sessions_2',
    'sessions_3',
    'sessions_4',
    'sessions_5',
    'sessions_6',
    'sessions_7',
    'sessions_8',
    'sessions_9',
    'sessions_10',
    'sessions_11',
    'sessions_12',
    'sessions_13',
    'sessions_14',
    'sessions_15',
    'sessions_16',
    'sessions_17',
    'sessions_18',
    'sessions_19',
    'sessions_20',
    'sessions_21',
    'sessions_22',
    'sessions_23',
    'sessions_24',
    'sessions_25',
    'sessions_26',
    'sessions_27',
    'sessions_28',
    'sessions_29',
    'sessions_30',
    'sessions_31',
    'sessions_32',
    'sessions_33',
    'sessions_34',
    'sessions_35',
    'sessions_36',
    'sessions_37',
    'sessions_38',
    'sessions_39',
    'sessions_40',
    'sessions_41',
    'sessions_42',
    'sessions_43',
    'sessions_44',
    'sessions_45',
    'sessions_46',
    'sessions_47',
    'sessions_48',
    'sessions_49',
    'sessions_50',
    'volume_2500',
    'volume_5000',
    'volume_10000',
    'volume_25000',
    'volume_50000',
    'volume_75000',
    'volume_100000',
    'volume_150000',
    'volume_200000',
    'volume_300000',
    'volume_400000',
    'volume_500000',
    'volume_650000',
    'volume_800000',
    'volume_1000000',
    'volume_1500000',
    'volume_2000000',
    'volume_3000000',
    'volume_5000000',
    'streak_14',
    'streak_30',
    'streak_60',
    'streak_100',
    'streak_180',
    'streak_365',
    'bench_40',
    'bench_60',
    'bench_80',
    'bench_120',
    'bench_140',
    'bench_160',
    'bench_180',
    'bench_200',
    'bench_220',
    'bench_240',
    'bench_260',
    'bench_280',
    'bench_300',
    'squat_40',
    'squat_60',
    'squat_80',
    'squat_100',
    'squat_120',
    'squat_140',
    'squat_160',
    'squat_180',
    'squat_200',
    'squat_220',
    'squat_240',
    'squat_260',
    'squat_280',
    'squat_300',
    'deadlift_40',
    'deadlift_60',
    'deadlift_80',
    'deadlift_100',
    'deadlift_120',
    'deadlift_140',
    'deadlift_160',
    'deadlift_180',
    'deadlift_200',
    'deadlift_220',
    'deadlift_240',
    'deadlift_260',
    'deadlift_280',
    'deadlift_300',
    'days_3',
    'days_7',
    'days_14',
    'days_30',
    'days_60',
    'days_100',
    'days_200',
    'days_365',
    'days_500',
    'days_1000',
    'reps_100',
    'reps_250',
    'reps_500',
    'reps_1000',
    'reps_2500',
    'reps_5000',
    'reps_10000',
    'reps_25000',
    'reps_50000',
    'reps_100000'
  ] loop
    earned := false;
    if achievement_key = 'first_pr' then
      earned := not exists(select 1 from public.user_achievements where user_id=new.user_id and achievement_key='first_pr')
        and (select count(*) from public.lifts where user_id=new.user_id and exercise=new.exercise and status='VERIFIED') >= 1;
    elsif achievement_key = 'bench_100' then
      earned := new.exercise='bench' and new.weight_kg >= 100;
    elsif achievement_key like 'sessions_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_sessions >= threshold;
    elsif achievement_key like 'volume_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_volume >= threshold;
    elsif achievement_key like 'streak_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := streak >= threshold;
    elsif achievement_key like 'days_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := training_days >= threshold;
    elsif achievement_key like 'reps_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := total_reps >= threshold;
    elsif achievement_key like 'bench_%' or achievement_key like 'squat_%' or achievement_key like 'deadlift_%' then
      threshold := split_part(achievement_key,'_',2)::integer;
      earned := new.exercise::text=split_part(achievement_key,'_',1)
        and new.weight_kg >= threshold;
    end if;

    if earned then
      insert into public.user_achievements(user_id,achievement_key)
      values(new.user_id,achievement_key)
      on conflict(user_id,achievement_key) do nothing;
      if found then
        insert into public.user_progress(user_id,xp,current_streak,longest_streak,last_activity_on)
        values(new.user_id,10,0,0,null)
        on conflict(user_id) do update set xp=public.user_progress.xp+10,updated_at=now();
        insert into public.notifications(user_id,kind,title,body,href)
        values(new.user_id,'rank','Achievement unlocked','You unlocked '||replace(achievement_key,'_',' ')||' · +10 XP','/leaderboards');
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists lifts_award_achievements on public.lifts;
create trigger lifts_award_achievements
after insert or update of status on public.lifts
for each row execute function public.award_lift_achievements();
