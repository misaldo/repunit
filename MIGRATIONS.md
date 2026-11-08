# REPUNIT database migrations

## One canonical backend

All app environments and database operations must use this single Supabase project:

- Project ref: `sfumcokjwvhxwuanlofw`
- Project URL: `https://sfumcokjwvhxwuanlofw.supabase.co`
- Supabase CLI link: `supabase link --project-ref sfumcokjwvhxwuanlofw`

Do not use the Lovable Cloud gateway as `SUPABASE_URL` or `VITE_SUPABASE_URL`. The committed `.env.example` points both variables to the canonical project. Real `.env` files are local-only and must never be committed.

## Exact migration order

The existing database baseline is documented as migrations `0000`–`0011`. Confirm that baseline before continuing. Apply each missing file below once, in this exact order, and stop immediately if any file fails.

### Existing-project repairs: 0012–0023

1. `drizzle/migrations/0012_repair_training_splits.sql`
2. `drizzle/migrations/0013_repair_crew_battles.sql`
3. `drizzle/migrations/0014_friend_callouts.sql`
4. `drizzle/migrations/0015_notifications_center.sql`
5. `drizzle/migrations/0016_progression_reward_fixes.sql`
6. `drizzle/migrations/0017_leaderboard_audience_and_weight_classes.sql`
7. `drizzle/migrations/0018_pro_subscriptions.sql`
8. `drizzle/migrations/0019_throne_events.sql`
9. `drizzle/migrations/0020_lift_video_engagement.sql`
10. `drizzle/migrations/0021_volume_crew_battles.sql`
11. `drizzle/migrations/0022_streak_xp_bonus.sql`
12. `drizzle/migrations/0023_crew_achievement_awards.sql`

The onboarding/avatar migration was assigned a duplicate `0019` in an earlier version. Its unique filename is `0024_first_run_onboarding_and_avatars.sql`; apply it after all of 0012–0023.

### Subsequent migrations: 0024–0042

13. `drizzle/migrations/0024_first_run_onboarding_and_avatars.sql`
14. `drizzle/migrations/0025_admin_lift_review.sql`
15. `drizzle/migrations/0026_auto_verify_uploaded_lifts.sql`
16. `drizzle/migrations/0027_privacy_hardening.sql`
17. `drizzle/migrations/0028_optional_pr_video.sql`
18. `drizzle/migrations/0029_friend_challenge_copy.sql`
19. `drizzle/migrations/0030_crew_battle_score_rpc.sql`
20. `drizzle/migrations/0031_crew_leaderboard_rpc.sql`
21. `drizzle/migrations/0032_schedule_weekly_crew_battles.sql`
22. `drizzle/migrations/0033_friends_split_visibility.sql`
23. `drizzle/migrations/0034_competition_notifications.sql`
24. `drizzle/migrations/0035_friend_requests.sql`
25. `drizzle/migrations/0036_crew_total_include_overhead_press.sql`
26. `drizzle/migrations/0037_automatic_lift_proof_and_flags.sql`
27. `drizzle/migrations/0038_proof_transition_hardening.sql`
28. `drizzle/migrations/0039_pr_celebrations_always_fire.sql`
29. `drizzle/migrations/0040_weekly_winners_badge_trigger.sql`
30. `drizzle/migrations/0041_require_video_for_lifts.sql` — require uploaded video proof for every new lift.
31. `drizzle/migrations/0042_pr_rank_movement.sql` — store previous and new exercise ranks on the private PR celebration event.

The proof-transition hardening migration previously shared the `0038` number with the PR-celebration migration. The PR-celebration and Weekly Winners migrations are now numbered `0039` and `0040` so the sequence is unique. Their SQL behavior is unchanged.

## Applying migrations safely

The SQL files live under `drizzle/migrations/`; do not assume Supabase CLI migration commands discover them automatically.

1. Back up the target database.
2. Link the intended project: `supabase link --project-ref sfumcokjwvhxwuanlofw`.
3. Inspect `supabase_migrations.schema_migrations` and the actual schema before deciding what is pending. A manually pasted SQL Editor migration may not be registered in that table.
4. Apply each missing SQL file in the exact order above using the Supabase SQL Editor, one file at a time.
5. Wait for success before moving to the next file. If any statement fails, stop and resolve it before continuing.
6. Record the applied filename and date. Never blindly replay a migration solely because it is absent from CLI history.

To inspect recorded history:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

This history is not conclusive if SQL was previously pasted manually into the SQL Editor. Compare the database objects/policies with the migration SQL before replaying anything.

## Privacy requirements

Migration `0027_privacy_hardening.sql` must be applied to the canonical project. It removes anonymous reads from the private `lift-videos` bucket and grants the anonymous role access only to safe public profile columns. The anonymous public TOP leaderboard remains available through its public RPC.

The corresponding checks are in `supabase/tests/privacy_hardening.sql`.

## Lift proof and ranking behavior

Migration `0037_automatic_lift_proof_and_flags.sql` adds database-side plausibility checks, duplicate detection, a 10-submission daily cap, PR-jump proof requirements, and Crew flags. `NEEDS_PROOF` and `UNDER_REVIEW` results must not count in rankings. Three distinct Crew members can flag a result; the owner can resolve it with video proof through the guarded RPC. Clients cannot set lift status directly.

This is rule-based validation, not computer vision and not an AI assessment of lifting technique. A video being attached does not prove that the lift was performed correctly.

The follow-up `0038_proof_transition_hardening.sql` clears stale verification timestamps and restricts proof attachment to lifts actually waiting for proof/review.

## Database tests

Run these against a local Supabase test database, not production:

```bash
supabase test db
```

The repository includes:

- `supabase/tests/privacy_hardening.sql`
- `supabase/tests/automatic_lift_proof_and_flags.sql`
- `supabase/tests/home_retention_features.sql`
- `supabase/tests/pr_rank_celebration.sql`

The local test database must first have the complete migration sequence applied. A passing local pgTAP run does not by itself prove the remote production database has been migrated.
