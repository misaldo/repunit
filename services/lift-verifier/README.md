# REPUNIT automatic lift verification worker

This is a separate Python service because full video decoding and computer-vision work should not run inside a Supabase Edge Function.

## What this first version does
- Authenticates Supabase Database Webhook requests with a shared secret.
- Downloads both private videos (full lift + separate plate close-up) using the Supabase service-role key.
- Computes SHA-256 and five sampled-frame perceptual hashes.
- Flags exact duplicates and strong frame-sequence matches, including many re-encoded copies and screen recordings.
- Uses adaptive joint-angle cycle thresholds for a conservative repetition screening estimate.
- Uses the separate plate close-up and OWLv2 only to collect diagnostic visual evidence.
- Never derives total bar load by doubling a single OCR value or assuming a 20 kg bar.
- Routes load claims to NEEDS_REVIEW until a validated model can account for every plate on both sleeves and the actual bar mass. A confident rep-count mismatch is REJECTED.

## Important limitation

**The current worker is not a fully automatic weight verifier.** The earlier implementation added 20 kg for the bar and doubled OCR plate readings. That assumption could report a false total when the bar differs from 20 kg, one sleeve is obscured, plates are not symmetric, or OCR reads background text. This calculation has been removed. OWLv2 detects candidate plate objects but is not a calibrated mass classifier; OCR text and repeated frames do not prove the complete load. Consequently, the worker deliberately leaves total load unknown and routes the lift to NEEDS_REVIEW rather than falsely claiming a weight match.

The pose-angle repetition counter is also a screening heuristic, not a validated competition judge. A labelled video corpus, an independently validated plate/bar recognition model, and measured false-accept/false-reject rates are required before automatic weight approval can be enabled. Do not use the current worker for prize decisions or claim zero-error verification.

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
