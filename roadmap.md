# REPUNIT implementation status

## Implemented in the repository
- [x] Existing sign-in, upload flow, crew invitations, member management and query error states preserved.
- [x] Mobile-first navigation: Feed, Workouts, Crews, Ranks and Profile; desktop navigation includes Battles and Challenges.
- [x] Working social feed with posts, likes and comments.
- [x] PWA install prompt with browser fallback and iOS instructions.
- [x] XP for lifts, verified PRs, streak milestones, likes and crew battle acceptance/completion.
- [x] Animated count-up metrics and confetti on verified PR notifications.
- [x] Lifter progression badges and automatic Crew badges: Iron Squad, Weekly Winners and 100 Ton Club.
- [x] Weekly crew battle categories: bench, squat, deadlift and total volume.
- [x] Optional pg_cron scheduling for weekly matchups and automatic battle finalization, with on-visit fallback.
- [x] Automatic Crew badges: Iron Squad, Weekly Winners and 100 Ton Club.
- [x] Friend call-outs and in-app notification center with per-type preferences.
- [x] Web Push subscription UI, service-worker handlers and a secured Edge Function sender.
- [x] Global/Friends/My Crew lifter leaderboards, date periods and bodyweight classes.
- [x] Top-ten video modal with playback, likes and comments.
- [x] Persistent throne-takeover events and animated Feed/home banner.
- [x] REPUNIT PRO pricing page, Stripe Checkout/Customer Portal Edge Function and signed webhook verification.
- [x] PRO strength analytics, Big Three estimated-1RM score, six-month volume chart, profile themes, badge and unlimited workout-plan gating.
- [x] Local setup, database, Edge Function and Vercel deployment documentation.
- [x] GitHub Actions workflow for TypeScript, lint, tests, production build and Deno checks.

## Required setup before release
- [ ] Apply pending Supabase migrations 0012–0023 in order.
- [ ] Deploy the Stripe and send-push Edge Functions and configure their server secrets.
- [ ] Configure Stripe recurring prices, Customer Portal and webhook events.
- [ ] Configure VAPID keys and the Supabase Database Webhook for notification inserts.
- [ ] Verify authenticated flows against the live Supabase project.
- [ ] Obtain a successful GitHub Actions run and perform a visual mobile/desktop review.

## Known limitations
- Real AI video analysis and moderation are not integrated. Submitted lifts remain unverified until an actual trusted verification process is connected. REPUNIT must never label a lift AI-checked or verified without that process.
- Push delivery requires VAPID secrets and the Supabase Database Webhook described in DEPLOYMENT.md.
- Stripe billing requires real Stripe products/prices, server secrets, Customer Portal activation and a verified webhook.
- pg_cron is optional. Without it, weekly pairings and expired-battle finalization use the app's on-visit fallback.
- This repository has not yet had a fresh local production build or authenticated browser audit in the current implementation session. The CI workflow is configured, but no green run has been confirmed here.
