"""Open-vocabulary visual detection of gym plates using Google's OWLv2.

This model locates likely plates and reports visual weight-label candidates. Its
scores are not calibrated mass measurements; never treat a text candidate as
proof of the actual load without readable markings or a calibrated setup.
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


@lru_cache(maxsize=1)
def _load_model() -> tuple[Any, Any]:
    processor = Owlv2Processor.from_pretrained(MODEL_ID)
    model = Owlv2ForObjectDetection.from_pretrained(MODEL_ID)
    model.eval()
    return processor, model


def inspect_weight_plates(video_file: str, *, max_frames: int = 4) -> dict[str, Any]:
    """Detect visible plates in sampled frames; do not claim exact load."""
    capture = cv2.VideoCapture(video_file)
    if not capture.isOpened():
        return {"available": False, "reason": "Video could not be opened for visual plate detection."}
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        capture.release()
        return {"available": False, "reason": "No video frames available for visual plate detection."}

    positions = sorted(set(
        max(0, min(total - 1, int(total * fraction)))
        for fraction in (0.18, 0.38, 0.58, 0.78)[:max_frames]
    ))
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
    for frame in frames:
        inputs = processor(text=[QUERIES], images=frame, return_tensors="pt")
        with torch.inference_mode():
            outputs = model(**inputs)
        target_sizes = torch.tensor([(frame.height, frame.width)])
        result = processor.post_process_object_detection(
            outputs=outputs, target_sizes=target_sizes, threshold=0.12
        )[0]
        detections = []
        for box, score, label in zip(result["boxes"], result["scores"], result["labels"]):
            idx = int(label.item())
            detections.append({
                "candidate": QUERIES[idx],
                "confidence": round(float(score.item()), 3),
                "box_xyxy": [round(float(v), 1) for v in box.tolist()],
            })
        detections.sort(key=lambda item: item["confidence"], reverse=True)
        frame_results.append({"detections": detections[:12]})

    candidates: dict[str, list[float]] = {}
    for item in frame_results:
        for detection in item["detections"]:
            candidates.setdefault(detection["candidate"], []).append(detection["confidence"])
    ranked = sorted(
        (
            {"candidate": name, "best_confidence": round(max(scores), 3), "frames_seen": len(scores)}
            for name, scores in candidates.items()
        ),
        key=lambda item: (item["frames_seen"], item["best_confidence"]),
        reverse=True,
    )
    return {
        "available": True,
        "model": MODEL_ID,
        "frames_analyzed": len(frames),
        "candidate_labels": ranked[:8],
        "frames": frame_results,
        "mass_estimate_kg": None,
        "note": "OWLv2 detects visual objects and text-conditioned candidates. Candidate labels are not calibrated plate weights; exact load still requires readable labels, a known plate system, or calibrated reference geometry.",
    }
