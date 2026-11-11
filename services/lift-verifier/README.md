# REPUNIT lift video screening worker

This is a separate Python service because full video decoding and computer-vision work should not run inside a Supabase Edge Function.

## What this first version does
- Authenticates Supabase Database Webhook requests with a shared secret.
- Downloads the private lift video using the Supabase service-role key.
- Computes SHA-256 and five sampled-frame perceptual hashes.
- Flags exact duplicates and strong frame-sequence matches, including many re-encoded copies and screen recordings.
- Uses adaptive joint-angle cycle thresholds for a conservative repetition screening estimate.
- Requires repeated, consistent plate OCR observations across multiple sampled frames before returning an approximate load estimate.
- Fails closed: insufficient motion or inconsistent OCR is unknown, not a zero-rep or guessed-load result, and never becomes VERIFIED.

## Important limitation

**This worker intentionally does not mark any lift VERIFIED.** Adaptive pose-angle cycles and repeated plate OCR reduce some obvious false mismatches, but they do not prove the total load, exercise identity, competition-valid repetitions, range of motion, or technique. Camera angle, occlusion, plate visibility and bar type remain major limitations. This is still screening, not an automatic competition-lift judge. Do not deploy it as automatic approval without a labelled video evaluation set and independently validated exercise-specific models.

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