"""REPUNIT custom RF-DETR Small + PaddleOCR plate evidence pipeline.

This module only emits per-frame evidence. It never sums frame detections into a
barbell load: that requires temporal tracking, both-sleeve completeness, known
plate masses and known bar mass. A custom plate-trained checkpoint is required.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

MODEL_PATH_ENV = "REPUNIT_PLATE_MODEL_PATH"
PLATE_CLASS_NAMES_ENV = "REPUNIT_PLATE_CLASS_NAMES"
MODEL_REPO_ENV = "REPUNIT_PLATE_MODEL_REPO"
MODEL_REVISION_ENV = "REPUNIT_PLATE_MODEL_REVISION"
MODEL_SHA256_ENV = "REPUNIT_PLATE_MODEL_SHA256"
MODEL_FILENAME = "checkpoint_best_total.pth"
PUBLIC_MODEL_REPO = "Prithv122/custom-detector"
PUBLIC_MODEL_REVISION = "be16623ab1de46cc2e2b9e4df477af5d71d04c58"
PUBLIC_MODEL_SHA256 = "f802956130702712f05bfb82d8b437ea1648efe642ff90bbba2fb38a1d8bce1f"
DETECTOR_THRESHOLD_ENV = "REPUNIT_PLATE_DETECTOR_THRESHOLD"
DEFAULT_PLATE_CLASSES = {"plate", "weight_plate", "barbell_plate", "weight plate"}


def _resolve_checkpoint() -> Path:
    configured_path = os.environ.get(MODEL_PATH_ENV, "").strip()
    if configured_path:
        checkpoint = Path(configured_path)
        if not checkpoint.is_file():
            raise FileNotFoundError(f"RF-DETR plate checkpoint not found: {checkpoint}")
        return checkpoint

    # Public community checkpoint: pin both the immutable Hub revision and SHA-256.
    # Safe deserialization is used below; never silently enable pickle execution.
    repo_id = os.environ.get(MODEL_REPO_ENV, PUBLIC_MODEL_REPO).strip()
    revision = os.environ.get(MODEL_REVISION_ENV, PUBLIC_MODEL_REVISION).strip()
    expected_sha = os.environ.get(MODEL_SHA256_ENV, PUBLIC_MODEL_SHA256).strip().lower()
    if repo_id != PUBLIC_MODEL_REPO or revision != PUBLIC_MODEL_REVISION:
        raise RuntimeError(
            "A non-default public model repo/revision was configured. Supply a verified local "
            f"checkpoint through {MODEL_PATH_ENV} instead."
        )
    from huggingface_hub import hf_hub_download
    checkpoint_path = Path(hf_hub_download(
        repo_id=repo_id,
        filename=MODEL_FILENAME,
        revision=revision,
    ))
    import hashlib
    digest = hashlib.sha256(checkpoint_path.read_bytes()).hexdigest()
    if digest != expected_sha:
        raise RuntimeError("Downloaded RF-DETR checkpoint SHA-256 does not match the pinned model card.")
    return checkpoint_path


@lru_cache(maxsize=1)
def _load_detector() -> Any:
    checkpoint = _resolve_checkpoint()
    from rfdetr import RFDETR
    # The checkpoint is loaded with RF-DETR's safe deserialization defaults.
    # If this fails due to legacy checkpoint serialization, fail closed; do not
    # enable trust_checkpoint=True automatically.
    return RFDETR.from_checkpoint(str(checkpoint), device="cpu")


@lru_cache(maxsize=1)
def _load_ocr() -> Any:
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def _class_names() -> set[str]:
    raw = os.environ.get(PLATE_CLASS_NAMES_ENV, "").strip()
    if not raw:
        return DEFAULT_PLATE_CLASSES
    return {item.strip().lower().replace("-", "_") for item in raw.split(",") if item.strip()}


def _extract_ocr_text(result: Any) -> list[dict[str, Any]]:
    """Normalize PaddleOCR 3.x result objects without assuming one serialization shape."""
    payload: Any = result
    if hasattr(result, "json"):
        payload = result.json
        if callable(payload):
            payload = payload()
    if isinstance(payload, str):
        import json
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []
    if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
        payload = payload["res"]
    if not isinstance(payload, dict):
        return []

    texts = payload.get("rec_texts") or payload.get("texts") or []
    scores = payload.get("rec_scores") or payload.get("scores") or []
    observations: list[dict[str, Any]] = []
    for index, text in enumerate(texts):
        score = scores[index] if index < len(scores) else None
        observations.append({
            "text": str(text).strip(),
            "confidence": round(float(score), 3) if isinstance(score, (int, float)) else None,
        })
    return [item for item in observations if item["text"]]


def _normalize_detection_value(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _is_plate_class(name: str, allowed: set[str]) -> bool:
    normalized = name.strip().lower().replace("-", "_").replace(" ", "")
    # Public ProjektCiezary-derived checkpoint labels each plate by mass.
    # Collars ("zacisk") are deliberately excluded from plate-mass candidates.
    if normalized == "zacisk" or "collar" in normalized:
        return False
    if re.fullmatch(r"\d+(?:[.,]\d+)?kg", normalized):
        return True
    return normalized in allowed or any(token in normalized for token in ("weight_plate", "barbell_plate"))


def _ocr_plate_crop(ocr: Any, frame: np.ndarray, box: list[float]) -> list[dict[str, Any]]:
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = box
    pad_x = max(8, int((x2 - x1) * 0.12))
    pad_y = max(8, int((y2 - y1) * 0.12))
    left, top = max(0, int(x1) - pad_x), max(0, int(y1) - pad_y)
    right, bottom = min(width, int(x2) + pad_x), min(height, int(y2) + pad_y)
    crop = frame[top:bottom, left:right]
    if crop.size == 0:
        return []
    # PaddleOCR 3.x accepts an image array in predict().
    results = ocr.predict(crop)
    observations: list[dict[str, Any]] = []
    for result in results or []:
        observations.extend(_extract_ocr_text(result))
    return observations


def inspect_weight_plates(video_file: str, *, max_frames: int = 8) -> dict[str, Any]:
    """Detect custom-trained plate instances and OCR their crops on sampled frames."""
    try:
        detector = _load_detector()
    except Exception as error:
        return {
            "available": False,
            "detector": "RF-DETR Small",
            "reason": f"Custom RF-DETR plate checkpoint unavailable: {type(error).__name__}: {error}",
            "mass_estimate_kg": None,
            "complete_barbell_evidence": False,
            "both_sleeves_complete": False,
            "unique_plate_instances": False,
            "bar_mass_kg": None,
        }
    try:
        ocr = _load_ocr()
    except Exception as error:
        return {
            "available": False,
            "detector": "RF-DETR Small",
            "ocr": "PaddleOCR",
            "reason": f"PaddleOCR could not initialize: {type(error).__name__}: {error}",
            "mass_estimate_kg": None,
            "complete_barbell_evidence": False,
            "both_sleeves_complete": False,
            "unique_plate_instances": False,
            "bar_mass_kg": None,
        }

    capture = cv2.VideoCapture(video_file)
    if not capture.isOpened():
        return {"available": False, "reason": "Video could not be opened.", "mass_estimate_kg": None, "complete_barbell_evidence": False, "both_sleeves_complete": False, "unique_plate_instances": False, "bar_mass_kg": None}
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        capture.release()
        return {"available": False, "reason": "Video has no readable frames.", "mass_estimate_kg": None, "complete_barbell_evidence": False, "both_sleeves_complete": False, "unique_plate_instances": False, "bar_mass_kg": None}

    fractions = (0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82)[:max(1, max_frames)]
    positions = sorted(set(max(0, min(total - 1, int(total * fraction))) for fraction in fractions))
    allowed_classes = _class_names()
    frame_results: list[dict[str, Any]] = []

    for frame_index, position in enumerate(positions):
        capture.set(cv2.CAP_PROP_POS_FRAMES, position)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        height, width = frame.shape[:2]
        scale = min(1.0, 1280.0 / max(height, width))
        if scale < 1.0:
            frame = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        try:
            threshold = float(os.environ.get(DETECTOR_THRESHOLD_ENV, "0.53"))
            if not 0.0 < threshold < 1.0:
                raise ValueError(f"{DETECTOR_THRESHOLD_ENV} must be between 0 and 1")
            detections = detector.predict(image, threshold=threshold)
            boxes = _normalize_detection_value(getattr(detections, "xyxy", None))
            class_ids = _normalize_detection_value(getattr(detections, "class_id", None))
            confidences = _normalize_detection_value(getattr(detections, "confidence", None))
            data = getattr(detections, "data", {}) or {}
            class_names = _normalize_detection_value(data.get("class_name") if isinstance(data, dict) else None)
        except Exception as error:
            frame_results.append({
                "frame": frame_index,
                "detections": [],
                "error": f"RF-DETR inference failed: {type(error).__name__}",
            })
            continue

        frame_detections: list[dict[str, Any]] = []
        for index, raw_box in enumerate(boxes):
            if len(raw_box) < 4:
                continue
            class_name = str(class_names[index]) if index < len(class_names) else ""
            class_id = int(class_ids[index]) if index < len(class_ids) else None
            if not _is_plate_class(class_name, allowed_classes):
                continue
            box = [float(value) for value in raw_box[:4]]
            text_observations = _ocr_plate_crop(ocr, frame, box)
            frame_detections.append({
                "class_name": class_name,
                "class_id": class_id,
                "confidence": round(float(confidences[index]), 3) if index < len(confidences) else None,
                "box_xyxy": [round(value, 1) for value in box],
                "ocr": text_observations,
            })
        frame_results.append({"frame": frame_index, "detections": frame_detections})

    capture.release()
    detection_count = sum(len(item.get("detections", [])) for item in frame_results)
    all_text = [
        observation
        for frame in frame_results
        for detection in frame.get("detections", [])
        for observation in detection.get("ocr", [])
    ]
    # Surface explicit unit-bearing OCR only as a candidate. Never sum it:
    # one plate can appear in multiple frames and both sleeves may be occluded.
    explicit_mass_candidates = []
    for item in all_text:
        match = re.search(r"(?<!\d)(\d{1,3}(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)(?![a-z])", item["text"], re.I)
        if match:
            value = float(match.group(1).replace(",", "."))
            unit = match.group(2).lower()
            kg = value * 0.45359237 if unit.startswith("lb") else value
            explicit_mass_candidates.append({
                "source_text": item["text"],
                "candidate_kg": round(kg, 2),
                "ocr_confidence": item["confidence"],
            })

    return {
        "available": True,
        "detector": "RF-DETR Small",
        "checkpoint": "Prithv122/custom-detector@be16623ab1de46cc2e2b9e4df477af5d71d04c58",
        "checkpoint_sha256_verified": True,
        "ocr": "PaddleOCR",
        "frames_analyzed": len(frame_results),
        "plate_detections_across_frames_not_unique_plates": detection_count,
        "explicit_marking_candidates_not_total_load": explicit_mass_candidates,
        "frames": frame_results,
        "mass_estimate_kg": None,
        "complete_barbell_evidence": False,
        "both_sleeves_complete": False,
        "unique_plate_instances": False,
        "bar_mass_kg": None,
        "note": (
            "RF-DETR and PaddleOCR are connected for plate-instance detection and crop OCR. "
            "The public checkpoint detects plate-mass classes but was trained on side-on single-sleeve photos. Per-frame detections "
            "are not unique plate counts; OCR markings are not total load. Total load remains "
            "UNKNOWN until temporal association, both-sleeve completeness and bar mass are validated."
        ),
    }
