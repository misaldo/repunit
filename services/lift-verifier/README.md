# REPUNIT automatic lift verification worker

This is a separate Python service because full video decoding and computer-vision work should not run inside a Supabase Edge Function.

## What this first version does
- Authenticates Supabase Database Webhook requests with a shared secret.
- Downloads both private videos (full lift + separate plate close-up) using the Supabase service-role key.
- Computes SHA-256 and five sampled-frame perceptual hashes.
- Flags exact duplicates and strong frame-sequence matches, including many re-encoded copies and screen recordings.
- Uses adaptive joint-angle cycle thresholds for a conservative repetition screening estimate.
- Requires a separate close-up video of the loaded plates and repeated, consistent plate OCR observations across multiple sampled frames before returning an approximate load estimate.
- Returns VERIFIED only when both repetition count from the full-lift video and total-load OCR from the separate plate close-up match the declared values. Uncertain evidence is NEEDS_REVIEW; a confident rep-count mismatch is REJECTED.

## Important limitation

**VERIFIED requires both checks to match:** repetition count from the full-lift video and load estimate from the separate plate close-up. The plate close-up should show the markings on the loaded plates clearly, ideally both sleeves. Unreadable or inconsistent markings remain NEEDS_REVIEW. The current pose-angle and plate OCR methods are heuristic and have not been validated as a competition-grade judge. Validate against labelled videos before using results for prizes or high-stakes competitions.

Perceptual hashing is a strong duplicate signal, not an unbreakable anti-cheat system. Heavy crops, mirroring, speed changes, overlays, or camera changes can evade simple frame-hash matching. Suspected matches should be reviewed rather than advertised as impossible to bypass.

## Environment
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (server-side secret; never expose to the browser)
- LIFT_WEBHOOK_SECRET (long random secret)

## Run locally
```bash
docker build -t repunit-lift-verifier services/lift-verifier
docker run --rm -p 8080:8080 -e SUPABASE_URL=https://YOUR_PROJECT.supabase.co -e SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY -e LIFT_WEBHOOK_SECRET=YOUR_RANDOM_SECRET repunit-lift-verifier
```

Health check: GET /health

## Supabase webhook
After deploying this container to a private HTTPS service, create a Database Webhook in the Supabase Dashboard:
- Table: public.lifts
- Events: INSERT and UPDATE (the worker ignores rows that are not AI_ANALYZING)
- Method: POST
- URL: https://YOUR_WORKER_HOST/webhooks/lift-created
- Header: x-lift-webhook-secret: YOUR_RANDOM_SECRET
- Payload: include the inserted row in record

The webhook and worker must be deployed only after migration 0048 is applied. Use a separate secret for the webhook and never commit either secret to Git.

## Operational notes
- The fingerprint table is accessible only to the Supabase service role.
- Keep the worker private and rate-limited; do not expose its admin credentials.
- This initial worker is intended for small-volume screening. Add a durable queue and retry/dead-letter handling before scaling.
- Review the hosting provider's retention, region and privacy terms before sending videos to a third party.

## Unit tests for conservative signal helpers

From this directory, run:

```bash
python -m unittest discover -s tests -v
```
