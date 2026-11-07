# REPUNIT — focused product scope

## Product

REPUNIT is where friends compete in Crews on who lifts the most.

**STRENGTH IS SOCIAL. WHO IS THE STRONGEST IN YOUR CREW?**

REPUNIT is not a full workout tracker. The core loop is:

1. Log a personal record (PR).
2. See your position among friends and Crew members.
3. Compete in automatic weekly Crew Battles.
4. Climb the global TOP.

## In scope

- Authentication and lifter profiles: avatar, username and bio.
- Friends: send, accept, ignore and remove friend requests; follow and unfollow.
- Quick PR logging: bench, squat, deadlift and overhead press; weight and reps; optional video; prefill the last values.
- Crews: create, invite by link/code, join, view members, member rankings by lift and Crew total.
- Weekly Crew Battles: automatic Monday matchups, one category per week, live scores, progress, countdown, contributors, winner state and shareable result.
- Friend Challenges: challenge a friend, automatic PR call-outs, Accept/Ignore and pending/won/lost status.
- TOP: Lifters, Crews and Friends; Bench, Squat, Deadlift and Total; Week, Month and All time; podium and personal rank highlights.
- Weekly SPLIT: days, exercises, sets × reps and Public/Friends/Private visibility; view and copy another eligible user's SPLIT.
- In-app notifications and optional web push for PRs, rank takeovers, friend challenges and Crew Battle events.
- A simple streak flame only; no XP or level progression UI.

## Explicitly out of scope for this product pass

Keep the implementation in the repository, but do not expose these features in the main product experience:

- REPUNIT PRO, subscriptions, pricing and PRO analytics.
- Prize contests.
- XP, levels, achievement progression and Crew levels.
- General social feed/posts.
- Manually initiated Crew-vs-Crew challenges. Crew Battles are automatic weekly matchups.
- Full workout logging/tracking. SPLIT is a shareable weekly plan only.

Do not delete existing working code or database history just to hide an out-of-scope feature. Prefer removing navigation/entry points, redirecting routes, or disabling only the relevant UI.

## Quality requirements

- Phone-first layouts and controls; no horizontal overflow.
- Every visible button, link, tab, menu and form control must have a working action.
- PR logging should be possible in a few taps when the last values are prefilled.
- Use cached/previous data where possible, skeleton loading states and clear Retry actions.
- Never display raw backend errors to users.
- Do not describe a self-reported PR as AI-verified. Video evidence is optional; the current MVP is self-reported.
- Preserve all in-scope features when making future changes.

## Implementation and release verification

The repository contains implementations for the main flows and migrations through `0036_crew_total_include_overhead_press.sql`. This file is a scope contract, not proof that every migration is deployed or that every live flow has passed a device test.

Before release, verify the exact Supabase migration state, authentication and RLS on the configured project, push-notification configuration, and the full mobile flows on a real phone. A successful local typecheck, lint, test run and production build must also be recorded before claiming the app is release-ready.
