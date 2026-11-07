# REPUNIT local development and deployment

## Run REPUNIT locally

1. Install Node.js 22 LTS and Git.
2. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/misaldo/repunit.git
   cd repunit
   npm ci
   ```

3. Copy `.env.example` to `.env` and set the Supabase values:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`

   Do not commit `.env`. Never put a Supabase service-role key or Stripe secret in a `VITE_` variable.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open the exact local URL printed by Vite (the configured port is normally 8080). Keep the terminal open while using the app.

5. Run quality checks and a production build:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

## Supabase database

The canonical Supabase project ref is `sfumcokjwvhxwuanlofw`. The browser client uses the Lovable Cloud gateway URL configured in `.env`; the underlying Supabase project for CLI deployments and Edge Functions is this project ref. The existing project has already used migrations through `0011_complete_backend_setup.sql`. Check migration history and apply only pending migrations in the exact order documented in [MIGRATIONS.md](./MIGRATIONS.md):

- `0012_repair_training_splits.sql`
- `0013_repair_crew_battles.sql`
- `0014_friend_callouts.sql`
- `0015_notifications_center.sql`
- `0016_progression_reward_fixes.sql`
- `0017_leaderboard_audience_and_weight_classes.sql`
- `0018_pro_subscriptions.sql`
- `0019_throne_events.sql`
- `0020_lift_video_engagement.sql`
- `0021_volume_crew_battles.sql`
- `0022_streak_xp_bonus.sql`
- `0023_crew_achievement_awards.sql`
- `0024_first_run_onboarding_and_avatars.sql` (run after 0012–0023)

Continue with migrations `0025`–`0037` in the exact order listed in [MIGRATIONS.md](./MIGRATIONS.md). In particular, apply `0037_automatic_lift_proof_and_flags.sql` only after `0036_crew_total_include_overhead_press.sql`. Run `supabase/tests/automatic_lift_proof_and_flags.sql` with `supabase test db` on a local test database.

Run each pending SQL file in the Supabase SQL Editor. These repair migrations are designed to be repeatable, but do not skip ahead in the sequence.

The app also expects the `lift-videos` Supabase Storage bucket and the appropriate authenticated-user storage policies for video uploads and signed playback URLs.

## Stripe billing (optional until Stripe is configured)

The Stripe integration runs as a Supabase Edge Function; Stripe secrets never go to the browser.

1. Create a Stripe product with recurring prices:
   - Monthly: USD 4.99
   - Yearly: USD 39.99
2. Copy both Stripe Price IDs.
3. Install the Supabase CLI, log in, and link this project:

   ```bash
   supabase login
   supabase link --project-ref sfumcokjwvhxwuanlofw
   ```

4. Set the Edge Function secrets (use your real values; do not commit them):

   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_MONTHLY=price_... STRIPE_PRICE_YEARLY=price_... STRIPE_WEBHOOK_SECRET=whsec_... APP_URL=https://your-domain.example
   ```

   Use Stripe test-mode keys and test prices until the whole payment flow has been verified. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.

5. Deploy the function:

   ```bash
   supabase functions deploy stripe
   ```

6. In Stripe Dashboard, add a webhook endpoint:

   `https://sfumcokjwvhxwuanlofw.supabase.co/functions/v1/stripe`

   Subscribe to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`. Enable the Stripe Customer Portal in Stripe settings before testing subscription management.

7. Run a test checkout and verify that the webhook writes the matching row to `public.user_subscriptions`. The app grants PRO status only for `active` or `trialing` subscriptions.

## Web Push notifications

1. Generate a VAPID key pair (for example with `npx web-push generate-vapid-keys`). Keep the private key secret.
2. Add `VITE_VAPID_PUBLIC_KEY` to the web app's Vercel environment variables and rebuild.
3. Set the following Supabase Edge Function secrets:

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@your-domain.example PUSH_WEBHOOK_SECRET=...
   ```

4. Deploy the push sender:

   ```bash
   supabase functions deploy send-push
   ```

5. In Supabase Dashboard, create a Database Webhook for `public.notifications`, event `INSERT`, method `POST`, URL:

   `https://sfumcokjwvhxwuanlofw.supabase.co/functions/v1/send-push`

   Add the header `x-repunit-webhook-secret` with the exact `PUSH_WEBHOOK_SECRET` value. The webhook body must include the inserted row in `record`. The function sends only to registered subscriptions and removes endpoints that return 404/410.

6. Open REPUNIT in a supported browser, go to Settings, and choose **Enable push**. Test with a real notification after the database webhook is enabled.

## Deploy the web app to Vercel

1. Push the repository to GitHub and import `misaldo/repunit` into Vercel.
2. Set the Vercel project environment variables for Production and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` only if a server-side admin operation is explicitly enabled; never expose it to the browser.
3. Set the Nitro deployment preset to `vercel` in the Vercel build environment if the default Cloudflare preset is selected by the build config. Also add `VITE_VAPID_PUBLIC_KEY` if Web Push is enabled.
4. Use `npm ci` as the install command and `npm run build` as the build command.
5. After deployment, verify authentication redirects, video upload/playback, PWA installation, database-backed routes, and the Stripe webhook against the production domain.

## Automated checks

GitHub Actions runs lint, unit tests, and the production build on pushes and pull requests to `main`. A green CI run is required before treating a change as release-ready.
