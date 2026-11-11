-- REPUNIT 0049: persist AI repetition and visible plate screening results.
-- AI_CHECKED remains a screening state; only an authorized moderator can set VERIFIED.

begin;

alter table public.lifts
  add column if not exists ai_reps_detected integer,
  add column if not exists ai_reps_confidence numeric(5,3),
  add column if not exists ai_reps_match boolean,
  add column if not exists ai_weight_read_kg numeric(6,2),
  add column if not exists ai_weight_confidence numeric(5,3),
  add column if not exists ai_weight_match boolean,
  add column if not exists ai_analysis jsonb;

alter table public.lifts
  drop constraint if exists lifts_ai_reps_detected_check,
  add constraint lifts_ai_reps_detected_check
    check (ai_reps_detected is null or ai_reps_detected between 0 and 100),
  drop constraint if exists lifts_ai_reps_confidence_check,
  add constraint lifts_ai_reps_confidence_check
    check (ai_reps_confidence is null or ai_reps_confidence between 0 and 1),
  drop constraint if exists lifts_ai_weight_confidence_check,
  add constraint lifts_ai_weight_confidence_check
    check (ai_weight_confidence is null or ai_weight_confidence between 0 and 1);

comment on column public.lifts.ai_reps_detected is 'AI estimated complete repetitions from submitted video; not a moderator approval.';
comment on column public.lifts.ai_weight_read_kg is 'AI OCR estimate from visible plate markings; null when unreadable.';
comment on column public.lifts.ai_analysis is 'Structured AI screening evidence and comparison with the user declaration.';

commit;
notify pgrst, 'reload schema';
