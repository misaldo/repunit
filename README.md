# REPUNIT

**STRENGTH IS SOCIAL. WHO IS THE STRONGEST IN YOUR CREW?**

REPUNIT is a social strength-training app for logging lifts, building Crews, sharing training plans, challenging friends and competing on verified leaderboards.

## Local development (Windows)

Requirements: Node.js 22 LTS and Git.

```powershell
cd C:\Users\k\Documents\GitHub\repunit
npm.cmd install
npm.cmd run dev
```

Open **http://localhost:8080** and keep the terminal running while you use the app.

For a production build:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

The development server uses the local environment in `.env`. Start from `.env.example` and add the Supabase project URL and publishable key. Never commit `.env`, a Supabase service-role key, Stripe secret, or VAPID private key.

## Environment variables

Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe Supabase publishable key.
- `VITE_SUPABASE_PROJECT_ID`: Supabase project ID.
- `VITE_VAPID_PUBLIC_KEY`: public Web Push VAPID key (optional until push is configured).

The browser must only receive `VITE_*` values that are safe to expose. Keep service-role, Stripe, webhook and VAPID private keys in Supabase Edge Function secrets, never in browser variables.

## Database setup

The original schema and backend setup are migrations `0000` through `0011`. If those have already been applied to your project, run the following additional SQL files **in numerical order** in Supabase → SQL Editor:

1. `drizzle/migrations/0012_repair_training_splits.sql`
2. `drizzle/migrations/0013_repair_crew_battles.sql`
3. `drizzle/migrations/0014_friend_callouts.sql`
4. `drizzle/migrations/0015_notifications_center.sql`
5. `drizzle/migrations/0016_progression_reward_fixes.sql`
6. `drizzle/migrations/0017_leaderboard_audience_and_weight_classes.sql`
7. `drizzle/migrations/0018_pro_subscriptions.sql`

Run each migration once, wait for Supabase to report success, then continue. If you already applied migrations `0013`, `0015`, `0016` or `0018` before the latest fixes, re-run those files after pulling the latest code; they are written to be safely repeatable. Migration `0016` also creates the lift-video likes/comments tables, wires like notifications and XP rewards, awards XP for streak milestones, and grants the Iron Squad / 100 Ton Club crew badges. Do not run these against a different Supabase project from the one configured in `.env`.

## Web Push setup (optional)

1. Generate a VAPID public/private key pair.
2. Set `VITE_VAPID_PUBLIC_KEY` in the local and production frontend environments.
3. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Supabase Edge Function secrets.
4. Deploy the `send-push` Edge Function.
5. Create a Supabase Database Webhook for INSERT events on `public.notifications`, targeting the deployed `send-push` function and sending the `x-repunit-webhook-secret` header with the same `PUSH_WEBHOOK_SECRET` value.
6. Users can enable push notifications from Settings. Browser permission and HTTPS are required.

## Stripe PRO setup (optional)

Create monthly and yearly recurring prices in Stripe. Configure these Supabase Edge Function secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_YEARLY`
- `APP_URL` (the deployed app URL)

Deploy the `stripe` Supabase Edge Function. Configure a Stripe webhook pointing to that function for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Apply migration `0018_pro_subscriptions.sql` before enabling checkout. Subscription status is written by the server-side webhook; clients cannot grant themselves PRO.

## Deploy to Vercel

1. Push the repository to GitHub and import `misaldo/repunit` in Vercel.
2. Use the repository root as the project root and select the Vite/TanStack Start app.
3. Set the build command to `NITRO_PRESET=vercel npm run build` and the install command to `npm ci`.
4. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` and (when configured) `VITE_VAPID_PUBLIC_KEY` to Vercel's environment variables.
5. Add the production domain as an allowed redirect URL in Supabase Authentication.
6. Deploy the Supabase migrations, Edge Functions, Stripe webhook and push webhook separately as described above.
7. Run a production smoke test: sign up, log in, create/join a Crew, submit a lift, open Ranks, and verify the Settings and Notifications pages.

Do not put server secrets in Vercel `VITE_*` variables. Stripe and push secrets belong in Supabase Edge Function secrets.

## Automated checks

GitHub Actions runs TypeScript, ESLint, Vitest, Deno checks for the Edge Functions, and a production build on pushes and pull requests to `main`. A green workflow is required before treating a change as build-verified.

## Current architecture

- React 19, TanStack Start/Router, Vite and Tailwind CSS.
- Supabase Auth, Postgres, Row Level Security, Realtime and Edge Functions.
- Browser PWA manifest, service worker and install prompt.
- Stripe-hosted Checkout and Customer Portal.
- VAPID Web Push delivery through a Supabase Edge Function.

## Important limitations

- AI lift verification requires a separately configured verification service and should not be represented as automated unless that service is deployed and enabled.
- Push delivery and Stripe billing require the external secrets, webhooks and Edge Function deployments above.
- Local UI development does not automatically apply SQL migrations or deploy Edge Functions.
