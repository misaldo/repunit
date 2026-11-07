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

The automatic video verification migration is `drizzle/migrations/0026_auto_verify_uploaded_lifts.sql`. Apply it after `0025_admin_lift_review.sql`. It requires an actual object in the private `lift-videos` bucket, owned by the submitting user, before a normal authenticated submission is inserted as `VERIFIED`. This is automatic MVP approval based on video upload presence; it does not use computer vision or judge lifting technique. The existing admin review RPC and page remain available for older pending submissions and exceptional cases.

The privacy hardening migration is `drizzle/migrations/0027_privacy_hardening.sql`. Apply it after `0026_auto_verify_uploaded_lifts.sql`. It removes anonymous read access to `lift-videos`, keeps signed-in playback, and grants anon only the public profile columns needed by public pages. The matching pgTAP checks are in `supabase/tests/privacy_hardening.sql`.

The pgTAP permission test is `supabase/tests/admin_lift_review_permissions.sql`. Run it against a local Supabase test database with `supabase test db` after applying the migration. Do not run it against production as a substitute for a backup or deployment check.

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
