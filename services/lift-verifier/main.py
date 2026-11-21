"""REPUNIT lift-video screening: repetition counting and visible plate OCR.

This worker produces AI screening results only. It never grants VERIFIED status.
Unreadable evidence is sent to NEEDS_REVIEW instead of guessing.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import pytesseract
import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
TESSERACT_CMD = os.environ.get("TESSERACT_CMD", "").strip()
if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

logger = logging.getLogger("repunit.lift_verifier")

app = FastAPI(title="REPUNIT Lift Video Screening", version="0.2.0")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LIFT_WEBHOOK_SECRET = os.environ.get("LIFT_WEBHOOK_SECRET", "")
BUCKET = "lift-videos"
MAX_VIDEO_BYTES = 50 * 1024 * 1024
REQUEST_TIMEOUT = 30
BAR_WEIGHT_KG = 20.0
PLATE_WEIGHTS = (0.5, 1.0, 1.25, 2.0, 2.5, 5.0, 10.0, 15.0, 20.0, 25.0)


def _headers() -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase worker credentials are not configured")
    return {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": "application/json"}


def _rest(method: str, path: str, **kwargs: Any) -> requests.Response:
    response = requests.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers={**_headers(), **kwargs.pop("headers", {})}, timeout=REQUEST_TIMEOUT, **kwargs)
    response.raise_for_status()
    return response


def _set_status(lift_id: str, video_path: str, status: str, reason: str, analysis: dict[str, Any] | None = None) -> None:
    payload: dict[str, Any] = {"status": status, "verification_reason": reason[:500], "verified_at": None}
    if analysis is not None:
        payload.update({
            "ai_reps_detected": analysis.get("reps_detected"),
            "ai_reps_confidence": analysis.get("reps_confidence"),
            "ai_reps_match": analysis.get("reps_match"),
            "ai_weight_read_kg": analysis.get("weight_read_kg"),
            "ai_weight_confidence": analysis.get("weight_confidence"),
            "ai_weight_match": analysis.get("weight_match"),
            "ai_analysis": analysis,
        })
    _rest("PATCH", "lifts", params={"id": f"eq.{lift_id}", "video_path": f"eq.{video_path}", "status": "eq.AI_ANALYZING", "select": "id"}, headers={"Prefer": "return=minimal"}, json=payload)


def _is_current_video(lift_id: str, video_path: str) -> bool:
    rows = _rest("GET", "lifts", params={"id": f"eq.{lift_id}", "status": "eq.AI_ANALYZING", "select": "id,video_path", "limit": "1"}).json()
    return bool(rows and rows[0].get("video_path") == video_path)


def _download_video(video_path: str, destination: Path) -> None:
    response = requests.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{video_path}", headers=_headers(), timeout=120, stream=True)
    response.raise_for_status()
    total = 0
    with destination.open("wb") as output:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_VIDEO_BYTES:
                raise ValueError("Uploaded video exceeds the 50 MB screening limit")
            output.write(chunk)
    if total == 0:
        raise ValueError("Uploaded video is empty")


def _sample_hashes(video_file: Path) -> tuple[str, list[str]]:
    capture = cv2.VideoCapture(str(video_file))
    if not capture.isOpened():
        raise ValueError("Video could not be decoded")
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if frame_count < 2:
        capture.release()
        raise ValueError("Video is too short or has no decodable frames")
    positions = sorted(set(max(0, min(frame_count - 1, round(frame_count * f))) for f in (0.08, 0.27, 0.50, 0.73, 0.92)))
    hashes: list[str] = []
    for position in positions:
        capture.set(cv2.CAP_PROP_POS_FRAMES, position)
        ok, frame = capture.read()
        if ok and frame is not None:
            gray = cv2.cvtColor(cv2.resize(frame, (256, 256), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
            hashes.append(bytes(cv2.img_hash.pHash(gray).flatten()).hex())
    capture.release()
    if len(hashes) < 3:
        raise ValueError("Not enough usable frames for video screening")
    return hashlib.sha256(video_file.read_bytes()).hexdigest(), hashes


def _hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def _find_duplicate(digest: str, hashes: list[str]) -> str | None:
    # Only byte-for-byte identical files are rejected automatically.
    # Perceptual frame similarity is not proof of reused footage: separate
    # attempts can share a camera angle, rack, platform, or background.
    rows = _rest("GET", "lift_video_fingerprints", params={"select": "lift_id,sha256", "limit": "5000"}).json()
    for row in rows:
        if row.get("sha256") == digest:
            return str(row["lift_id"])
    return None


def _store_fingerprint(lift_id: str, digest: str, hashes: list[str]) -> None:
    _rest("POST", "lift_video_fingerprints", params={"on_conflict": "lift_id"}, headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, json={"lift_id": lift_id, "sha256": digest, "frame_hashes": hashes})


def _angle(a: Any, b: Any, c: Any) -> float | None:
    ax, ay = a.x - b.x, a.y - b.y
    cx, cy = c.x - b.x, c.y - b.y
    denom = math.hypot(ax, ay) * math.hypot(cx, cy)
    if denom < 1e-8:
        return None
    cosine = max(-1.0, min(1.0, (ax * cx + ay * cy) / denom))
    return math.degrees(math.acos(cosine))


def _joint_signal(landmarks: Any, exercise: str) -> tuple[float | None, float]:
    pose = mp.solutions.pose.PoseLandmark
    pairs = {
        "bench": (pose.LEFT_SHOULDER, pose.LEFT_ELBOW, pose.LEFT_WRIST, pose.RIGHT_SHOULDER, pose.RIGHT_ELBOW, pose.RIGHT_WRIST),
        "ohp": (pose.LEFT_SHOULDER, pose.LEFT_ELBOW, pose.LEFT_WRIST, pose.RIGHT_SHOULDER, pose.RIGHT_ELBOW, pose.RIGHT_WRIST),
        "pullup": (pose.LEFT_SHOULDER, pose.LEFT_ELBOW, pose.LEFT_WRIST, pose.RIGHT_SHOULDER, pose.RIGHT_ELBOW, pose.RIGHT_WRIST),
        "squat": (pose.LEFT_HIP, pose.LEFT_KNEE, pose.LEFT_ANKLE, pose.RIGHT_HIP, pose.RIGHT_KNEE, pose.RIGHT_ANKLE),
        "deadlift": (pose.LEFT_SHOULDER, pose.LEFT_HIP, pose.LEFT_KNEE, pose.RIGHT_SHOULDER, pose.RIGHT_HIP, pose.RIGHT_KNEE),
    }
    ids = pairs.get(exercise)
    if not ids:
        return None, 0.0
    candidates = []
    for tri in (ids[:3], ids[3:]):
        points = [landmarks[i.value] for i in tri]
        visibility = min(float(p.visibility) for p in points)
        if visibility >= 0.55:
            value = _angle(*points)
            if value is not None:
                candidates.append((value, visibility))
    if not candidates:
        return None, 0.0
    return max(candidates, key=lambda item: item[1])


def _count_repetitions(video_file: Path, exercise: str) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(video_file))
    if not capture.isOpened():
        raise ValueError("Video could not be decoded for repetition analysis")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    stride = max(1, round(fps / 8.0))
    values: list[float] = []
    visibilities: list[float] = []
    with mp.solutions.pose.Pose(static_image_mode=False, model_complexity=1, enable_segmentation=False, min_detection_confidence=0.55, min_tracking_confidence=0.55) as pose:
        for frame_no in range(0, total, stride):
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if result.pose_landmarks:
                value, visibility = _joint_signal(result.pose_landmarks.landmark, exercise)
                if value is not None:
                    values.append(value)
                    visibilities.append(visibility)
    capture.release()
    if len(values) < 12:
        return {"reps_detected": None, "reps_confidence": 0.0, "samples": len(values), "reason": "Not enough clear body landmarks; use a stable side view."}
    # Median smoothing suppresses one-frame landmark jumps.
    smooth = [sorted(values[max(0, i-2):min(len(values), i+3)])[len(values[max(0, i-2):min(len(values), i+3)])//2] for i in range(len(values))]
    low, high = (115.0, 150.0)
    if exercise == "squat":
        low, high = 115.0, 155.0
    elif exercise == "deadlift":
        low, high = 105.0, 150.0
    elif exercise == "pullup":
        low, high = 95.0, 150.0
    count, reached_bottom = 0, False
    amplitudes: list[float] = []
    state_values: list[float] = []
    for value in smooth:
        if value <= low:
            reached_bottom = True
            state_values.append(value)
        elif value >= high and reached_bottom:
            count += 1
            reached_bottom = False
            state_values.append(value)
    amplitude = max(smooth) - min(smooth)
    coverage = min(1.0, len(values) / max(20.0, (total / max(fps, 1.0)) * 3.0))
    confidence = max(0.0, min(0.95, 0.35 + min(0.35, amplitude / 100.0) + 0.25 * (sum(visibilities) / len(visibilities)) + 0.05 * coverage))
    if amplitude < 28:
        confidence *= 0.45
    return {"reps_detected": count, "reps_confidence": round(confidence, 3), "samples": len(values), "angle_range": [round(min(smooth), 1), round(max(smooth), 1)], "reason": "Estimated from repeated joint-angle cycles; camera angle and full-body visibility affect accuracy."}


def _ocr_plate_value(image: Any) -> float | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    enlarged = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    variants = [enlarged, cv2.threshold(enlarged, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]]
    for variant in variants:
        text = pytesseract.image_to_string(variant, config="--psm 11 -c tessedit_char_whitelist=0123456789.")
        for raw in re.findall(r"\d{1,2}(?:\.\d{1,2})?", text):
            try:
                value = float(raw)
            except ValueError:
                continue
            match = min(PLATE_WEIGHTS, key=lambda item: abs(item - value))
            if abs(match - value) <= 0.35:
                return match
    return None


def _read_plate_markings(video_file: Path, exercise: str) -> dict[str, Any]:
    if exercise == "pullup":
        return {"weight_read_kg": None, "weight_confidence": 0.0, "reason": "Pull-up loading cannot be inferred from plate OCR."}
    capture = cv2.VideoCapture(str(video_file))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        capture.release()
        return {"weight_read_kg": None, "weight_confidence": 0.0, "reason": "No frames available for plate reading."}
    observations: list[float] = []
    for fraction in (0.2, 0.35, 0.5, 0.65, 0.8):
        capture.set(cv2.CAP_PROP_POS_FRAMES, min(total - 1, int(total * fraction)))
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        height, width = frame.shape[:2]
        scale = min(1.0, 1280.0 / max(width, height))
        if scale < 1.0:
            frame = cv2.resize(frame, (int(width * scale), int(height * scale)))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        circles = cv2.HoughCircles(cv2.medianBlur(gray, 5), cv2.HOUGH_GRADIENT, dp=1.2, minDist=max(24, gray.shape[1] // 12), param1=100, param2=34, minRadius=max(12, gray.shape[1] // 90), maxRadius=max(20, gray.shape[1] // 3))
        frame_values: list[float] = []
        if circles is not None:
            for x, y, radius in circles[0][:12]:
                r = int(radius * 0.62)
                cx, cy = int(x), int(y)
                crop = frame[max(0, cy-r):min(frame.shape[0], cy+r), max(0, cx-r):min(frame.shape[1], cx+r)]
                if crop.size:
                    value = _ocr_plate_value(crop)
                    if value is not None:
                        frame_values.append(value)
        # Keep a frame only when at least one plausible plate marking was read.
        if frame_values:
            observations.append(BAR_WEIGHT_KG + 2.0 * sum(frame_values))
    capture.release()
    if not observations:
        return {"weight_read_kg": None, "weight_confidence": 0.0, "reason": "Plate markings were not clearly readable. No weight estimate was invented."}
    rounded = [round(value * 2) / 2 for value in observations]
    common, hits = Counter(rounded).most_common(1)[0]
    confidence = min(0.75, 0.35 + 0.12 * hits + 0.05 * min(len(observations), 3))
    return {"weight_read_kg": common, "weight_confidence": round(confidence, 3), "observations": len(observations), "reason": "Estimate assumes a 20 kg bar and mirrors the readable plates on one side; hidden or unreadable plates cannot be confirmed."}


def _process_lift(record: dict[str, Any]) -> None:
    lift_id, video_path = str(record.get("id", "")), str(record.get("video_path", ""))
    if not lift_id or not video_path:
        logger.warning("Ignoring lift webhook without id or video_path")
        return
    logger.info("Starting AI screening for lift %s", lift_id)
    try:
        rows = _rest("GET", "lifts", params={"id": f"eq.{lift_id}", "select": "id,status,video_path,exercise,weight_kg,reps", "limit": "1"}).json()
        if not rows or rows[0].get("status") != "AI_ANALYZING" or rows[0].get("video_path") != video_path:
            return
        lift = rows[0]
        exercise = str(lift.get("exercise", "")).lower()
        declared_weight, declared_reps = float(lift["weight_kg"]), int(lift["reps"])
        with tempfile.TemporaryDirectory(prefix="repunit-lift-") as directory:
            video_file = Path(directory) / "proof-video"
            _download_video(video_path, video_file)
            digest, hashes = _sample_hashes(video_file)
            if not _is_current_video(lift_id, video_path):
                return
            duplicate_of = _find_duplicate(digest, hashes)
            if duplicate_of and duplicate_of != lift_id:
                logger.warning("Exact duplicate video for lift %s matches lift %s", lift_id, duplicate_of)
                _set_status(lift_id, video_path, "REJECTED", "This exact video file was already submitted for another lift.")
                return
            _store_fingerprint(lift_id, digest, hashes)
            reps = _count_repetitions(video_file, exercise)
            weight = _read_plate_markings(video_file, exercise)
            reps_match = reps["reps_detected"] == declared_reps if reps["reps_detected"] is not None and reps["reps_confidence"] >= 0.65 else None
            weight_read = weight["weight_read_kg"]
            weight_match = abs(weight_read - declared_weight) <= 2.5 if weight_read is not None and weight["weight_confidence"] >= 0.55 else None
            analysis = {
                "exercise": exercise,
                "declared_reps": declared_reps,
                "reps_detected": reps["reps_detected"],
                "reps_confidence": reps["reps_confidence"],
                "reps_match": reps_match,
                "reps_reason": reps["reason"],
                "declared_weight_kg": declared_weight,
                "weight_read_kg": weight_read,
                "weight_confidence": weight["weight_confidence"],
                "weight_match": weight_match,
                "weight_reason": weight["reason"],
                "decision": "AI_CHECKED" if reps_match is True and weight_match is True else "NEEDS_REVIEW",
                "note": "AI_CHECKED is only a screening pass. A moderator must still approve the lift; this worker never sets VERIFIED."
            }
            if not _is_current_video(lift_id, video_path):
                return
            if reps_match is True and weight_match is True:
                _set_status(lift_id, video_path, "AI_CHECKED", f"AI screening matched {reps['reps_detected']} reps and approximately {weight_read:g} kg. Moderator approval is still required.", analysis)
            else:
                reasons = []
                if reps_match is None: reasons.append("repetition count is uncertain")
                elif reps_match is False: reasons.append(f"detected {reps['reps_detected']} reps, declared {declared_reps}")
                if weight_match is None: reasons.append("plate weight is unreadable or uncertain")
                elif weight_match is False: reasons.append(f"visible plate estimate {weight_read:g} kg differs from declared {declared_weight:g} kg")
                _set_status(lift_id, video_path, "NEEDS_REVIEW", "AI could not confirm the submission: " + "; ".join(reasons) + ". Moderator review required.", analysis)
            logger.info("AI screening finished for lift %s with status %s", lift_id, "AI_CHECKED" if reps_match is True and weight_match is True else "NEEDS_REVIEW")
    except Exception as error:
        logger.exception("AI screening failed for lift %s (%s)", lift_id, type(error).__name__)
        try:
            _set_status(lift_id, video_path, "NEEDS_REVIEW", f"Automatic analysis could not finish safely ({type(error).__name__}). Manual review required.")
        except Exception:
            logger.exception("Could not persist failure status for lift %s", lift_id)


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "repunit-lift-verifier", "status": "ok"}


@app.post("/webhooks/lift-created")
async def lift_created(request: Request, background_tasks: BackgroundTasks, x_lift_webhook_secret: str | None = Header(default=None)) -> dict[str, str]:
    if not LIFT_WEBHOOK_SECRET or not hmac.compare_digest(x_lift_webhook_secret or "", LIFT_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    record = payload.get("record") if isinstance(payload, dict) else None
    if not isinstance(record, dict):
        raise HTTPException(status_code=400, detail="Expected database webhook record")
    if record.get("status") != "AI_ANALYZING":
        return {"status": "ignored"}
    background_tasks.add_task(_process_lift, record)
    return {"status": "queued"}
