-- REPUNIT 0045 smoke checks. Run after applying the migration in Supabase SQL Editor.
-- These checks validate the new RPCs, RLS and seeded cosmetic catalog without changing data.

do $$
begin
  if to_regclass('public.repunit_events') is null then raise exception 'repunit_events table missing'; end if;
  if to_regclass('public.repunit_event_entries') is null then raise exception 'repunit_event_entries table missing'; end if;
  if to_regclass('public.repunit_rivalry_challenges') is null then raise exception 'repunit_rivalry_challenges table missing'; end if;
  if to_regclass('public.repunit_cosmetics') is null then raise exception 'repunit_cosmetics table missing'; end if;
  if to_regclass('public.repunit_user_cosmetics') is null then raise exception 'repunit_user_cosmetics table missing'; end if;
  if to_regprocedure('public.admin_create_repunit_event(text,text,timestamp with time zone,timestamp with time zone,public.exercise)') is null then raise exception 'admin event RPC missing'; end if;
  if to_regprocedure('public.repunit_event_leaderboard(uuid)') is null then raise exception 'event leaderboard RPC missing'; end if;
  if to_regprocedure('public.repunit_challenge_back(uuid,public.exercise)') is null then raise exception 'challenge-back RPC missing'; end if;
  if to_regprocedure('public.repunit_equip_cosmetic(text)') is null then raise exception 'cosmetic equip RPC missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='repunit_events' and policyname='authenticated read events') then raise exception 'event read policy missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='repunit_user_cosmetics' and policyname='authenticated read public cosmetic unlocks') then raise exception 'cosmetic display policy missing'; end if;
  if (select count(*) from public.repunit_cosmetics) < 7 then raise exception 'cosmetic catalog seed incomplete'; end if;
end $$;
