# REPUNIT database migrations

## Target backend

Apply these migrations only to the REPUNIT Supabase project with project ref:

`sfumcokjwvhxwuanlofw`

The browser client currently reaches this backend through the Lovable Cloud gateway URL configured as `VITE_SUPABASE_URL` in the local `.env`. Supabase CLI linking and Edge Function deployment use the project ref above.

## Exact application order: 0012–0023

The repository's documented baseline is migrations `0000`–`0011`. If that baseline is present, apply the following SQL files in this exact order. Do not skip a pending migration or apply them alphabetically by description.

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

The onboarding/avatar migration was previously also numbered `0019`. Its filename has been changed to `0024_first_run_onboarding_and_avatars.sql`; its SQL contents were preserved unchanged. Apply it only after 0012–0023.

The admin lift review migration is `drizzle/migrations/0025_admin_lift_review.sql`. Apply it after `0024_first_run_onboarding_and_avatars.sql`. It adds the admin-only pending-lift queue RPC, the admin approve/reject RPC, and a guarded exception in the lift verification trigger so only that admin RPC can change a submitted lift's status. The original XP, achievement and throne triggers remain in place.

The automatic video verification migration is `drizzle/migrations/0026_auto_verify_uploaded_lifts.sql`. Apply it after `0025_admin_lift_review.sql`. It requires an actual object in the private `lift-videos` bucket, owned by the submitting user, before a normal authenticated submission is inserted as `VERIFIED`. This is automatic MVP approval based on video upload presence; it does not use computer vision or judge lifting technique. The manual admin review RPC/page is removed by migration 0037; older pending submissions can be resolved by their owners with video proof.

The privacy hardening migration is `drizzle/migrations/0027_privacy_hardening.sql`. Apply it after `0026_auto_verify_uploaded_lifts.sql`. It removes anonymous read access to `lift-videos`, keeps signed-in playback, and grants anon only the public profile columns needed by public pages. The matching pgTAP checks are in `supabase/tests/privacy_hardening.sql`.

Run the database tests against a local Supabase test database with `supabase test db` after applying the migrations. Do not run them against production as a substitute for a backup or deployment check.

## Check which migrations are already applied

### If migrations were applied with the Supabase CLI

From the repository root, link the intended project and compare local and remote migration history:

```bash
supabase link --project-ref sfumcokjwvhxwuanlofw
supabase migration list --linked
```

The CLI only lists migrations it recognizes in its configured migrations directory. These REPUNIT SQL files are currently under `drizzle/migrations/`, so do not assume the CLI will discover them automatically. Review the remote history before using CLI migration commands.

You can also inspect the remote history table in the Supabase SQL Editor:

```sql
select version, name
from supabase_migrations.schema_migrations
where version between '0012' and '0023'
order by version;
```

A row is evidence that the corresponding version was registered in Supabase migration history. No row is not proof that the SQL was never run: SQL pasted manually into the SQL Editor is not automatically registered in this table.

### If migrations were run manually in the SQL Editor

Use the SQL Editor query above if the project has migration-history records. Otherwise, compare the schema and policies created by each migration with the corresponding SQL file. Keep a written record of every successfully applied filename. Do not blindly rerun a migration just because it is absent from the CLI history; inspect its SQL first, even if it is intended to be repeatable.

After applying a migration, wait for the SQL Editor to report success before moving to the next file. If a migration fails, stop and resolve that error before continuing.

The PR flow refocus migration is `drizzle/migrations/0028_optional_pr_video.sql`. Apply it after `0027_privacy_hardening.sql`. It makes video evidence optional for a PR while preserving owner checks and verifying that any supplied video object exists in the private bucket. User-submitted PRs count as self-reported results; `VERIFIED` does not mean AI or human technique verification.
The friend-challenge notification migration is `drizzle/migrations/0029_friend_challenge_copy.sql`. Apply it after `0028_optional_pr_video.sql`. Automatic mutual-friend call-outs now include the lift, weight and suggested target in the notification; the existing Accept / Ignore and win/loss challenge workflow is retained.
The battle-score RPC migration is `drizzle/migrations/0030_crew_battle_score_rpc.sql`. Apply it after `0029_friend_challenge_copy.sql`. It computes battle totals and top contributors in Postgres and only returns the aggregate scores plus the top three contributors for each crew; the client no longer downloads all battle lifts to calculate the scoreboard.
The Crew leaderboard RPC migration is `drizzle/migrations/0031_crew_leaderboard_rpc.sql`. Apply it after `0030_crew_battle_score_rpc.sql`. Crew totals, member counts, weekly wins and the current user's Crew membership are aggregated in Postgres; private Crews are only returned to their own members.
The weekly battle scheduler migration is `drizzle/migrations/0032_schedule_weekly_crew_battles.sql`. Apply it after `0031_crew_leaderboard_rpc.sql`. It enables Supabase `pg_cron` and schedules Monday 00:00 UTC matchup generation plus 15-minute battle finalization; the existing on-visit fallback remains available.
The Friends-only SPLIT visibility migration is `drizzle/migrations/0033_friends_split_visibility.sql`. Apply it after `0032_schedule_weekly_crew_battles.sql`. It keeps the existing `followers` database value for compatibility, but only users who follow each other can read a Friends-only split and its exercises; the UI labels this option Friends.
The competition-notifications migration is `drizzle/migrations/0034_competition_notifications.sql`. Apply it after `0033_friends_split_visibility.sql`. It sends the previous top lifter a clear King of the Throne takeover notification and includes the winning Crew or draw in battle-result notifications.
The explicit friend-request migration is `drizzle/migrations/0035_friend_requests.sql`. Apply it after `0034_competition_notifications.sql`. It adds separate friend requests with Accept / Ignore / Remove, keeps Follow independent, switches automatic friend call-outs to accepted friends, and secures Friends-only SPLIT access to accepted friends.

The Crew-total correction is `drizzle/migrations/0036_crew_total_include_overhead_press.sql`. Apply it after `0035_friend_requests.sql`. It includes all four core REPUNIT lifts (bench, squat, deadlift and overhead press) in the Crew all-lifts total; the global TOP Total remains the Big Three.


The automatic lift checks and Crew proof-flag workflow is `drizzle/migrations/0037_automatic_lift_proof_and_flags.sql`. Apply it after `0036_crew_total_include_overhead_press.sql`. The database classifies normal submissions as VERIFIED or NEEDS_PROOF, applies exercise-specific weight/reps plausibility limits (bench 400 kg, squat/deadlift 500 kg, overhead press 250 kg, weighted pull-up 200 kg; 1–30 reps), a 10-lift UTC-day cap, duplicate detection, and a maximum one unproven PR jump of up to 10% over the user's previous best per UTC day. NEEDS_PROOF and UNDER_REVIEW lifts are excluded from rankings because leaderboard and battle queries count VERIFIED rows only. Three distinct members who share a Crew with the lifter can flag a result; the owner must attach or replace a private video through the guarded RPC to restore VERIFIED status. Clients cannot directly update lift status. The proof workflow also prevents XP being awarded twice when a flagged lift is restored.

The matching pgTAP permission/schema checks are in `supabase/tests/automatic_lift_proof_and_flags.sql`. Run them with `supabase test db` against a local test database after applying the migration. The former admin review route and RPC are removed; there is no admin queue. Legacy pending rows can be resolved by their owners through the same video-proof RPC.

The proof-transition hardening migration is `drizzle/migrations/0038_proof_transition_hardening.sql`. Apply it after `0037_automatic_lift_proof_and_flags.sql`. It clears stale verification timestamps when a lift is flagged, so an under-review result cannot influence later PR checks, and restricts the proof RPC to lifts actually waiting for proof/review (including legacy PENDING rows). The expanded pgTAP checks are in `supabase/tests/automatic_lift_proof_and_flags.sql`.
