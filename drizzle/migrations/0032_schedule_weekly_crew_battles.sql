-- REPUNIT 0032: ensure weekly Crew matchups are generated every Monday.
-- Supabase supports pg_cron; retain the on-visit fallback in ensure_weekly_crew_battles.

begin;

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'repunit-weekly-crew-battles') then
    perform cron.schedule(
      'repunit-weekly-crew-battles',
      '0 0 * * 1',
      'select public.repunit_generate_weekly_crew_battles()'
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'repunit-finalize-crew-battles') then
    perform cron.schedule(
      'repunit-finalize-crew-battles',
      '*/15 * * * *',
      'select public.repunit_finalize_expired_crew_battles()'
    );
  end if;
end;
$$;

commit;
