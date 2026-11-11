"""Open-vocabulary visual detection of gym plates using Google's OWLv2.

OWLv2 can locate likely plates and compare text-conditioned appearance labels.
It is NOT a calibrated mass classifier. This module suppresses overlapping
boxes and aggregates evidence per frame so duplicate boxes cannot masquerade
as repeated detections or a plate count.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import cv2
import torch
from PIL import Image
from transformers import Owlv2ForObjectDetection, Owlv2Processor

MODEL_ID = "google/owlv2-base-patch16-ensemble"
QUERIES = [
    "a barbell weight plate",
    "a black rubber gym weight plate",
    "a 5 kg barbell weight plate",
    "a 10 kg barbell weight plate",
    "a 15 kg barbell weight plate",
    "a 20 kg barbell weight plate",
    "a 25 kg barbell weight plate",
    "a 45 lb barbell weight plate",
]
SCORE_THRESHOLD = 0.12
NMS_IOU_THRESHOLD = 0.45


@lru_cache(maxsize=1)
def _load_model() -> tuple[Any, Any]:
    processor = Owlv2Processor.from_pretrained(MODEL_ID)
    model = Owlv2ForObjectDetection.from_pretrained(MODEL_ID)
    model.eval()
    return processor, model


def _iou(a: list[float], b: list[float]) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - intersection
    return intersection / union if union > 0 else 0.0


def _suppress_duplicate_boxes(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Class-agnostic NMS: the same physical plate often matches several prompts."""
    kept: list[dict[str, Any]] = []
    for candidate in sorted(detections, key=lambda item: item["confidence"], reverse=True):
        if all(_iou(candidate["box_xyxy"], prior["box_xyxy"]) < NMS_IOU_THRESHOLD for prior in kept):
            kept.append(candidate)
    return kept


def inspect_weight_plates(video_file: str, *, max_frames: int = 8) -> dict[str, Any]:
    """Detect visible plates across sampled frames; never invent exact kilograms."""
    capture = cv2.VideoCapture(video_file)
    if not capture.isOpened():
        return {"available": False, "reason": "Video could not be opened for visual plate detection."}
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        capture.release()
        return {"available": False, "reason": "No video frames available for visual plate detection."}

    fractions = (0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82)[:max(1, max_frames)]
    positions = sorted(set(max(0, min(total - 1, int(total * fraction))) for fraction in fractions))
    frames: list[Image.Image] = []
    for position in positions:
        capture.set(cv2.CAP_PROP_POS_FRAMES, position)
        ok, frame = capture.read()
        if ok and frame is not None:
            height, width = frame.shape[:2]
            scale = min(1.0, 960.0 / max(height, width))
            if scale < 1.0:
                frame = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
            frames.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
    capture.release()
    if not frames:
        return {"available": False, "reason": "No readable frames for visual plate detection."}

    processor, model = _load_model()
    frame_results: list[dict[str, Any]] = []
    for frame_index, frame in enumerate(frames):
        inputs = processor(text=[QUERIES], images=frame, return_tensors="pt")
        with torch.inference_mode():
            outputs = model(**inputs)
        target_sizes = torch.tensor([(frame.height, frame.width)])
        result = processor.post_process_object_detection(
            outputs=outputs, target_sizes=target_sizes, threshold=SCORE_THRESHOLD
        )[0]
        raw: list[dict[str, Any]] = []
        for box, score, label in zip(result["boxes"], result["scores"], result["labels"]):
            idx = int(label.item())
            raw.append({
                "candidate": QUERIES[idx],
                "confidence": round(float(score.item()), 3),
                "box_xyxy": [round(float(v), 1) for v in box.tolist()],
            })
        detections = _suppress_duplicate_boxes(raw)[:12]
        frame_results.append({"frame": frame_index, "detections": detections})

    # Count each label at most once per frame. The previous implementation
    # counted every box as a new frame observation, inflating evidence badly.
    candidates: dict[str, list[float]] = {}
    for item in frame_results:
        per_frame: dict[str, float] = {}
        for detection in item["detections"]:
            label = detection["candidate"]
            per_frame[label] = max(per_frame.get(label, 0.0), detection["confidence"])
        for label, confidence in per_frame.items():
            candidates.setdefault(label, []).append(confidence)

    ranked = sorted(
        (
            {
                "candidate": label,
                "best_confidence": round(max(scores), 3),
                "mean_confidence": round(sum(scores) / len(scores), 3),
                "frames_seen": len(scores),
            }
            for label, scores in candidates.items()
        ),
        key=lambda item: (item["frames_seen"], item["mean_confidence"]),
        reverse=True,
    )
    return {
        "available": True,
        "model": MODEL_ID,
        "frames_analyzed": len(frames),
        "candidate_labels": ranked[:8],
        "frames": frame_results,
        "mass_estimate_kg": None,
        "note": (
            "Detections are deduplicated with non-maximum suppression and label evidence is counted once per frame. "
            "Text-conditioned labels are visual hypotheses, not calibrated mass measurements. Exact load still "
            "requires readable markings or a trained/calibrated plate classifier for the actual plate system."
        ),
    }
