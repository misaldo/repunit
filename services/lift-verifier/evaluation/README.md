# REPUNIT lift AI evaluation harness

This offline tool compares candidate video-analysis models before automatic lift verification is enabled. It does not connect to Supabase, upload videos, or change lift statuses.

## Dataset required

No labelled REPUNIT dataset is currently included. Prepare at least 30 clips for an initial pilot, covering bench, squat, deadlift, overhead press and pull-up where applicable. Include valid and invalid cases: wrong reps/load, incomplete range of motion, hidden plates, occlusion, edited footage and ambiguous camera angles. Thirty clips are a pilot only, not proof of production-grade safety. Expand the held-out dataset before launch and have two people label validity independently, adjudicating disagreements.

Do not commit videos or personal data to GitHub. Use pseudonymous IDs and a controlled, access-restricted dataset store. Obtain informed permission before using private gym footage.

## Label manifest

Copy `labels.example.csv` to `labels.csv` and replace the example rows with real labels. Columns:
- `video_id`: pseudonymous unique ID
- `exercise`: bench, squat, deadlift, ohp or pullup
- `declared_reps` and `declared_weight_kg`: user claim
- `ground_truth_reps` and `ground_truth_weight_kg`: independently labelled actual result
- `is_valid`: whether the whole lift meets REPUNIT's published evidence and technique rules

A valid row should match the declaration. Invalid rows should include plausible cheating and ambiguous footage, not only wrong numbers. Record bar type/mass and plate configuration in a separate controlled annotation record; the numeric total alone is not enough to train plate-instance recognition.

## Candidate predictions

Write one JSON object per line to `predictions.jsonl`, running every model on the same video IDs:

```json
{"model":"candidate-a","video_id":"clip-001","predicted_reps":5,"predicted_weight_kg":100.0,"reps_confidence":0.96,"weight_confidence":0.93,"proposed_verified":true,"latency_ms":4200,"cost_usd":0.002}
```

Use null for unreadable reps or weight. Confidence values must be genuine model outputs or separately calibrated values; do not invent them. A 0.90 confidence value is not evidence of 90% accuracy.

## Run

From repository root:

```bash
python services/lift-verifier/evaluation/evaluate.py --labels services/lift-verifier/evaluation/labels.csv --predictions services/lift-verifier/evaluation/predictions.jsonl --output services/lift-verifier/evaluation/report.md
python -m unittest discover -s services/lift-verifier/evaluation -p "test_*.py" -v
```

The report compares exact rep accuracy, weight accuracy within ±2.5 kg, joint numeric accuracy, false verifies among invalid clips, precision, latency and estimated cost.

## Gate applied

A candidate proposal counts as VERIFIED only if both confidence values are at least 0.90, predicted reps equal declared reps, predicted weight is within ±2.5 kg of declared weight, and the model proposed verification. Otherwise it counts as NOT_VERIFIED. False-verification metrics are compared with human `is_valid` labels. Missing predictions count as non-verifications.

## Current result

The harness and unit tests are available, but no real model comparison or accuracy claim is possible until a labelled dataset and prediction files exist. The checked-in CSV contains illustrative rows only; they are not training or evaluation evidence. Do not connect an experimental model to production until candidates have been evaluated on the same held-out clips and false positives have been reviewed.
