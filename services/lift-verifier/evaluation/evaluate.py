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
LABEL_FIELDS = {"video_id", "exercise", "declared_reps", "declared_weight_kg", "ground_truth_reps", "ground_truth_weight_kg", "is_valid"}
PREDICTION_FIELDS = {"model", "video_id", "predicted_reps", "predicted_weight_kg", "reps_confidence", "weight_confidence", "proposed_verified"}


def parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    raise ValueError(f"Invalid boolean: {value!r}")


def load_labels(path: Path) -> dict[str, dict]:
    labels: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        missing = LABEL_FIELDS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing label columns: {sorted(missing)}")
        for line_no, row in enumerate(reader, 2):
            video_id = row["video_id"].strip()
            if not video_id or video_id in labels:
                raise ValueError(f"Missing/duplicate video_id on line {line_no}")
            labels[video_id] = {
                "exercise": row["exercise"].strip().lower(),
                "declared_reps": int(row["declared_reps"]),
                "declared_weight_kg": float(row["declared_weight_kg"]),
                "ground_truth_reps": int(row["ground_truth_reps"]),
                "ground_truth_weight_kg": float(row["ground_truth_weight_kg"]),
                "is_valid": parse_bool(row["is_valid"]),
            }
    if not labels:
        raise ValueError("No labelled videos found")
    return labels


def load_predictions(path: Path) -> dict[str, dict[str, dict]]:
    predictions: dict[str, dict[str, dict]] = defaultdict(dict)
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            missing = PREDICTION_FIELDS - set(row)
            if missing:
                raise ValueError(f"Missing prediction fields on line {line_no}: {sorted(missing)}")
            model = str(row["model"]).strip()
            video_id = str(row["video_id"]).strip()
            if not model or not video_id or video_id in predictions[model]:
                raise ValueError(f"Empty or duplicate model/video_id on line {line_no}")
            row["proposed_verified"] = parse_bool(row["proposed_verified"])
            for key in ("reps_confidence", "weight_confidence"):
                row[key] = float(row[key])
                if not math.isfinite(row[key]) or not 0 <= row[key] <= 1:
                    raise ValueError(f"{key} must be finite and between 0 and 1")
            for key in ("predicted_reps", "predicted_weight_kg"):
                if row[key] is not None:
                    row[key] = float(row[key])
                    if not math.isfinite(row[key]):
                        raise ValueError(f"{key} must be finite or null")
            predictions[model][video_id] = row
    if not predictions:
        raise ValueError("No predictions found")
    return dict(predictions)


def ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def evaluate(labels: dict[str, dict], predictions: dict[str, dict],
             confidence_threshold: float = CONFIDENCE_THRESHOLD,
             weight_tolerance_kg: float = WEIGHT_TOLERANCE_KG) -> dict:
    unknown = set(predictions) - set(labels)
    if unknown:
        raise ValueError(f"Unknown video_id(s): {sorted(unknown)}")

    reps_scored = reps_correct = weight_scored = weight_correct = 0
    joint_scored = joint_correct = predicted_verified = true_verified = false_verified = 0
    valid_total = sum(1 for label in labels.values() if label["is_valid"])
    invalid_total = len(labels) - valid_total
    latencies: list[float] = []
    costs: list[float] = []

    for video_id, label in labels.items():
        pred = predictions.get(video_id)
        if pred is None:
            continue
        reps, weight = pred["predicted_reps"], pred["predicted_weight_kg"]
        if reps is not None:
            reps_scored += 1
            if reps.is_integer() and int(reps) == label["ground_truth_reps"]:
                reps_correct += 1
        if weight is not None:
            weight_scored += 1
            if abs(weight - label["ground_truth_weight_kg"]) <= weight_tolerance_kg:
                weight_correct += 1
        if reps is not None and weight is not None:
            joint_scored += 1
            if reps.is_integer() and int(reps) == label["ground_truth_reps"] and abs(weight - label["ground_truth_weight_kg"]) <= weight_tolerance_kg:
                joint_correct += 1

        matches_claim = (
            reps is not None and reps.is_integer()
            and int(reps) == label["declared_reps"]
            and weight is not None
            and abs(weight - label["declared_weight_kg"]) <= weight_tolerance_kg
        )
        confidence_ok = pred["reps_confidence"] >= confidence_threshold and pred["weight_confidence"] >= confidence_threshold
        if pred["proposed_verified"] and matches_claim and confidence_ok:
            predicted_verified += 1
            if label["is_valid"]:
                true_verified += 1
            else:
                false_verified += 1
        if pred.get("latency_ms") is not None:
            latency = float(pred["latency_ms"])
            if math.isfinite(latency) and latency >= 0:
                latencies.append(latency)
        if pred.get("cost_usd") is not None:
            cost = float(pred["cost_usd"])
            if math.isfinite(cost) and cost >= 0:
                costs.append(cost)

    return {
        "videos_total": len(labels),
        "videos_predicted": len(predictions),
        "videos_missing": len(labels) - len(predictions),
        "reps_exact_accuracy": ratio(reps_correct, reps_scored),
        "reps_scored": reps_scored,
        "weight_within_tolerance_accuracy": ratio(weight_correct, weight_scored),
        "weight_scored": weight_scored,
        "joint_accuracy": ratio(joint_correct, joint_scored),
        "joint_scored": joint_scored,
        "predicted_verified": predicted_verified,
        "verified_precision": ratio(true_verified, predicted_verified),
        "valid_lift_recall": ratio(true_verified, valid_total),
        "false_verify_count": false_verified,
        "false_verify_rate_on_invalid": ratio(false_verified, invalid_total),
        "invalid_videos_total": invalid_total,
        "mean_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "total_cost_usd": round(sum(costs), 6) if costs else None,
    }


def render_report(results: dict[str, dict]) -> str:
    lines = [
        "# REPUNIT lift AI evaluation", "",
        "A confidence score is not an accuracy score.", "",
        "| Model | Videos | Missing | Exact reps | Weight ±2.5 kg | Joint accuracy | False verifies | False verify rate | Precision | Mean latency | Cost |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    def percent(value: float | None) -> str:
        return "n/a" if value is None else f"{value * 100:.1f}%"

    for model, result in sorted(results.items()):
        latency = "n/a" if result["mean_latency_ms"] is None else f'{result["mean_latency_ms"]:.0f} ms'
        cost = "n/a" if result["total_cost_usd"] is None else f'${result["total_cost_usd"]:.4f}'
        lines.append(
            f'| {model} | {result["videos_predicted"]}/{result["videos_total"]} | {result["videos_missing"]} '
            f'| {percent(result["reps_exact_accuracy"])} | {percent(result["weight_within_tolerance_accuracy"])} '
            f'| {percent(result["joint_accuracy"])} | {result["false_verify_count"]} '
            f'| {percent(result["false_verify_rate_on_invalid"])} | {percent(result["verified_precision"])} '
            f'| {latency} | {cost} |'
        )
    lines.extend([
        "", "## Automatic-verification gate", "",
        "- Both confidence values must be at least 0.90.",
        "- Predicted reps must equal the declared reps.",
        "- Predicted load must be within ±2.5 kg of the declared load.",
        "- Any failed gate is counted as NOT VERIFIED.",
        "- False-verification metrics are checked against human validity labels.",
        "- Missing predictions count as non-verifications.", "",
    ])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
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
    if args.output:
        args.output.write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
