#!/usr/bin/env python3
"""Offline evaluation for REPUNIT lift-verification model candidates."""
from __future__ import annotations
import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

CONFIDENCE_THRESHOLD = 0.90
WEIGHT_TOLERANCE_KG = 2.5
LABEL_FIELDS = {"video_id", "exercise", "declared_reps", "declared_weight_kg",
                "ground_truth_reps", "ground_truth_weight_kg", "is_valid"}
PREDICTION_FIELDS = {"model", "video_id", "predicted_reps", "predicted_weight_kg",
                     "reps_confidence", "weight_confidence", "proposed_verified"}

def parse_bool(value):
    if isinstance(value, bool):
        return value
    value = str(value).strip().lower()
    if value in {"1", "true", "yes", "y"}: return True
    if value in {"0", "false", "no", "n"}: return False
    raise ValueError(f"Invalid boolean: {value!r}")

def load_labels(path):
    labels = {}
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = LABEL_FIELDS - set(reader.fieldnames or [])
        if missing: raise ValueError(f"Missing label columns: {sorted(missing)}")
        for n, row in enumerate(reader, 2):
            key = row["video_id"].strip()
            if not key or key in labels: raise ValueError(f"Missing/duplicate video_id on line {n}")
            labels[key] = {
                "exercise": row["exercise"].strip().lower(),
                "declared_reps": int(row["declared_reps"]),
                "declared_weight_kg": float(row["declared_weight_kg"]),
                "ground_truth_reps": int(row["ground_truth_reps"]),
                "ground_truth_weight_kg": float(row["ground_truth_weight_kg"]),
                "is_valid": parse_bool(row["is_valid"]),
            }
    if not labels: raise ValueError("No labelled videos found")
    return labels

def load_predictions(path):
    result = defaultdict(dict)
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip(): continue
            row = json.loads(line)
            missing = PREDICTION_FIELDS - set(row)
            if missing: raise ValueError(f"Missing prediction fields on line {n}: {sorted(missing)}")
            model, video_id = str(row["model"]).strip(), str(row["video_id"]).strip()
            if not model or not video_id or video_id in result[model]:
                raise ValueError(f"Empty or duplicate model/video_id on line {n}")
            row["proposed_verified"] = parse_bool(row["proposed_verified"])
            for key in ("reps_confidence", "weight_confidence"):
                row[key] = float(row[key])
                if not 0 <= row[key] <= 1: raise ValueError(f"{key} must be between 0 and 1")
            for key in ("predicted_reps", "predicted_weight_kg"):
                if row[key] is not None: row[key] = float(row[key])
            result[model][video_id] = row
    if not result: raise ValueError("No predictions found")
    return dict(result)

def ratio(a, b):
    return round(a / b, 4) if b else None

def evaluate(labels, predictions, confidence_threshold=CONFIDENCE_THRESHOLD,
             weight_tolerance_kg=WEIGHT_TOLERANCE_KG):
    unknown = set(predictions) - set(labels)
    if unknown: raise ValueError(f"Unknown video_id(s): {sorted(unknown)}")
    reps_n = reps_ok = weight_n = weight_ok = joint_n = joint_ok = 0
    predicted_verified = true_verified = false_verified = valid_total = invalid_total = 0
    latencies, costs = [], []
    for label in labels.values():
        if label["is_valid"]: valid_total += 1
        else: invalid_total += 1
    for video_id, pred in predictions.items():
        label = labels[video_id]
        reps, weight = pred["predicted_reps"], pred["predicted_weight_kg"]
        if reps is not None:
            reps_n += 1
            if int(reps) == label["ground_truth_reps"]: reps_ok += 1
        if weight is not None and math.isfinite(weight):
            weight_n += 1
            if abs(weight - label["ground_truth_weight_kg"]) <= weight_tolerance_kg: weight_ok += 1
        if reps is not None and weight is not None:
            joint_n += 1
            if int(reps) == label["ground_truth_reps"] and abs(weight - label["ground_truth_weight_kg"]) <= weight_tolerance_kg:
                joint_ok += 1
        matches_claim = (reps is not None and int(reps) == label["declared_reps"]
                         and weight is not None
                         and abs(weight - label["declared_weight_kg"]) <= weight_tolerance_kg)
        confidence_ok = (pred["reps_confidence"] >= confidence_threshold
                         and pred["weight_confidence"] >= confidence_threshold)
        verified = pred["proposed_verified"] and matches_claim and confidence_ok
        if verified:
            predicted_verified += 1
            if label["is_valid"]: true_verified += 1
            else: false_verified += 1
        if pred.get("latency_ms") is not None: latencies.append(float(pred["latency_ms"]))
        if pred.get("cost_usd") is not None: costs.append(float(pred["cost_usd"]))
    return {
        "videos_total": len(labels), "videos_predicted": len(predictions),
        "videos_missing": len(labels) - len(predictions),
        "reps_exact_accuracy": ratio(reps_ok, reps_n), "reps_scored": reps_n,
        "weight_within_tolerance_accuracy": ratio(weight_ok, weight_n), "weight_scored": weight_n,
        "joint_accuracy": ratio(joint_ok, joint_n), "joint_scored": joint_n,
        "predicted_verified": predicted_verified,
        "verified_precision": ratio(true_verified, predicted_verified),
        "valid_lift_recall": ratio(true_verified, valid_total),
        "false_verify_count": false_verified,
        "false_verify_rate_on_invalid": ratio(false_verified, invalid_total),
        "invalid_videos_total": invalid_total,
        "mean_latency_ms": round(sum(latencies)/len(latencies), 1) if latencies else None,
        "total_cost_usd": round(sum(costs), 6) if costs else None,
    }

def render_report(results):
    lines = [
        "# REPUNIT lift AI evaluation", "",
        "A confidence score is not an accuracy score.", "",
        "| Model | Videos | Missing | Exact reps | Weight ±2.5 kg | Joint accuracy | False verifies | False verify rate | Precision | Mean latency | Cost |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    def pct(x): return "n/a" if x is None else f"{x*100:.1f}%"
    for model, r in sorted(results.items()):
        latency = "n/a" if r["mean_latency_ms"] is None else f'{r["mean_latency_ms"]:.0f} ms'
        cost = "n/a" if r["total_cost_usd"] is None else f'${r["total_cost_usd"]:.4f}'
        lines.append(f'| {model} | {r["videos_predicted"]}/{r["videos_total"]} | {r["videos_missing"]} | {pct(r["reps_exact_accuracy"])} | {pct(r["weight_within_tolerance_accuracy"])} | {pct(r["joint_accuracy"])} | {r["false_verify_count"]} | {pct(r["false_verify_rate_on_invalid"])} | {pct(r["verified_precision"])} | {latency} | {cost} |')
    lines += ["", "## Automatic-verification gate", "",
              "- Both confidence values must be at least 0.90.",
              "- Predicted reps must equal the declared reps.",
              "- Predicted load must be within ±2.5 kg of the declared load.",
              "- Any failed gate is counted as NOT VERIFIED.",
              "- False-verification metrics are checked against human validity labels.",
              "- Missing predictions count as non-verifications.", ""]
    return "\n".join(lines)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        labels = load_labels(args.labels)
        predictions = load_predictions(args.predictions)
        results = {name: evaluate(labels, rows) for name, rows in predictions.items()}
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"Evaluation failed: {error}", file=sys.stderr)
        return 2
    report = render_report(results)
    if args.output: args.output.write_text(report, encoding="utf-8")
    print(report)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
