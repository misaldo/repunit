-- REPUNIT 0050: enqueue replacement and explicitly re-queued lift videos.
-- This mirrors the existing database webhook configuration without storing
-- webhook credentials in source control.
begin;

do $migration$
declare
  trigger_sql text;
begin
  select pg_get_triggerdef(t.oid)
    into trigger_sql
  from pg_trigger t
  where t.tgrelid = 'public.lifts'::regclass
    and t.tgname = 'repunit-lift-ai-worker';

  if trigger_sql is null then
    raise exception 'Existing REPUNIT lift worker trigger was not found';
  end if;

  -- Replacements: only when the actual video path changes.
  execute 'drop trigger if exists "repunit-lift-ai-worker-video-replaced" on public.lifts';
  execute replace(
    replace(trigger_sql,
      'CREATE TRIGGER "repunit-lift-ai-worker" AFTER INSERT ON',
      'CREATE TRIGGER "repunit-lift-ai-worker-video-replaced" AFTER UPDATE OF video_path ON'),
    ' FOR EACH ROW EXECUTE FUNCTION',
    ' FOR EACH ROW WHEN (OLD.video_path IS DISTINCT FROM NEW.video_path AND NEW.video_path IS NOT NULL AND NEW.status = ''AI_ANALYZING'') EXECUTE FUNCTION'
  );

  -- Re-queue: changing a stuck lift's status back to AI_ANALYZING emits a
  -- fresh webhook, without touching its video object or credentials.
  execute 'drop trigger if exists "repunit-lift-ai-worker-requeued" on public.lifts';
  execute replace(
    replace(trigger_sql,
      'CREATE TRIGGER "repunit-lift-ai-worker" AFTER INSERT ON',
      'CREATE TRIGGER "repunit-lift-ai-worker-requeued" AFTER UPDATE OF status ON'),
    ' FOR EACH ROW EXECUTE FUNCTION',
    ' FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = ''AI_ANALYZING'') EXECUTE FUNCTION'
  );
end;
$migration$;

commit;
