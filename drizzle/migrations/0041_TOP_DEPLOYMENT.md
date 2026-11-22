# REPUNIT TOP ranking migration 0041

## Deployment safety

This migration has been validated against a disposable PostgreSQL 17 database. It has **not** been applied to the live REPUNIT Supabase project.

Before applying it to any persistent project:

1. Take and verify a database backup.
2. Apply `0041_top_database_ranking.sql` through the normal migration process.
3. Confirm the new RPCs and indexes exist.
4. Run `drizzle/tests/0041_top_database_ranking_smoke.sql` against a staging project.
5. Check the query plans and latency on production-sized, non-sensitive test data before enabling the new TOP page.

Do not run the disposable benchmark fixture against production. It inserts 10,000 profiles and 200,000 lifts.

## RPCs

- `get_top_lifters(_lift, _period, _scope, _limit, _cursor)`
  - Lift: `bench`, `squat`, `deadlift`, or `total`.
  - Period: `week`, `month`, or `all`; week/month boundaries are UTC.
  - Scope: `global`, `country`, or `crew`.
  - Uses VERIFIED lifts only; keyset cursor pagination.
  - Total requires all three verified lifts and sums their best weights.
- `get_my_rank(_lift, _period, _scope)`
- `get_top_crews(_lift, _period, _limit)`
  - Crew score is the combined best score of the five strongest eligible members.
- `get_rank_movers(_lift, _limit)`
- `set_top_opt_out(_opt_out)`
- `capture_top_rank_snapshot()` (service role / scheduled job only)

## Privacy and snapshots

`profiles.top_opt_out` hides a lifter from public global/country TOP. Their lifts remain stored; their results can remain visible to members of their own Crew. Snapshot table access is denied to anon/authenticated roles and goes through the security-definer RPCs.

The migration schedules a weekly snapshot on Mondays at 00:05 UTC only when the `cron` schema is available. Confirm the schedule after deployment; if pg_cron is not enabled, enable it through the project's approved Supabase process before relying on rank movement.

## Known schema limitation

There is currently no gyms table or profile gym field, so `get_top_gyms` is intentionally not created. Add gym rankings only after a gym data model and membership/privacy rules are agreed.

## Benchmark note

The CI fixture uses 10,000 profiles and 200,000 verified lifts. The benchmark output is recorded in the GitHub Actions logs. Some query classes have measured above the requested 100 ms target; do not interpret a successful SQL smoke test as proof that every ranking query meets that latency target.
