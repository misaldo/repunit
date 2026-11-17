-- REPUNIT 0054: add the terminal AI-only failure state.
-- Keep this enum change in its own migration so PostgreSQL commits it before use.
alter type public.lift_status add value if not exists 'NOT_VERIFIED';
