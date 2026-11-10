"""Fail-closed REPUNIT lift video screening service.

This first worker version fingerprints videos and checks for a visible human pose.
It intentionally NEVER marks a lift VERIFIED: pose landmarks do not prove the
declared barbell load, completed reps, or competition-standard technique.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import tempfile
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import requests
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

app = FastAPI(title="REPUNIT Lift Video Screening", version="0.1.0")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LIFT_WEBHOOK_SECRET = os.environ.get("LIFT_WEBHOOK_SECRET", "")
BUCKET = "lift-videos"
MAX_VIDEO_BYTES = 50 * 1024 * 1024
REQUEST_TIMEOUT = 30


def _headers() -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase worker credentials are not configured")
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _rest(method: str, path: str, **kwargs: Any) -> requests.Response:
    response = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={**_headers(), **kwargs.pop("headers", {})},
        timeout=REQUEST_TIMEOUT,
        **kwargs,
    )
    response.raise_for_status()
    return response


def _set_status(lift_id: str, status: str, reason: str) -> None:
    _rest(
        "PATCH",
        f"lifts?id=eq.{lift_id}",
        params={"select": "id"},
        headers={"Prefer": "return=minimal"},
        json={"status": status, "verification_reason": reason[:500], "verified_at": None},
    )


def _download_video(video_path: str, destination: Path) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{video_path}"
    response = requests.get(url, headers=_headers(), timeout=120, stream=True)
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
    positions = sorted(set(
        max(0, min(frame_count - 1, round(frame_count * fraction)))
        for fraction in (0.08, 0.27, 0.50, 0.73, 0.92)
    ))
    hashes: list[str] = []
    for position in positions:
        capture.set(cv2.CAP_PROP_POS_FRAMES, position)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        resized = cv2.resize(frame, (256, 256), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        hashes.append(bytes(cv2.img_hash.pHash(gray).flatten()).hex())
    capture.release()
    if len(hashes) < 3:
        raise ValueError("Not enough usable frames for video screening")
    digest = hashlib.sha256(video_file.read_bytes()).hexdigest()
    return digest, hashes


def _hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def _find_duplicate(digest: str, hashes: list[str]) -> str | None:
    rows = _rest(
        "GET", "lift_video_fingerprints",
        params={"select": "lift_id,sha256,frame_hashes", "limit": "5000"},
    ).json()
    for row in rows:
        if row.get("sha256") == digest:
            return str(row["lift_id"])
        old_hashes = row.get("frame_hashes") or []
        pair_count = min(len(hashes), len(old_hashes))
        if pair_count < 3:
            continue
        distances = [_hamming(hashes[i], old_hashes[i]) for i in range(pair_count)]
        if sum(distance <= 8 for distance in distances) >= pair_count - 1:
            return str(row["lift_id"])
    return None


def _store_fingerprint(lift_id: str, digest: str, hashes: list[str]) -> None:
    _rest(
        "POST", "lift_video_fingerprints",
        headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
        json={"lift_id": lift_id, "sha256": digest, "frame_hashes": hashes},
    )


def _pose_screen(video_file: Path) -> int:
    capture = cv2.VideoCapture(str(video_file))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    positions = [
        max(0, min(frame_count - 1, round(frame_count * fraction)))
        for fraction in (0.15, 0.40, 0.65, 0.85)
    ]
    found = 0
    try:
        with mp.solutions.pose.Pose(
            static_image_mode=True, model_complexity=1,
            enable_segmentation=False, min_detection_confidence=0.5,
        ) as pose:
            for position in positions:
                capture.set(cv2.CAP_PROP_POS_FRAMES, position)
                ok, frame = capture.read()
                if not ok or frame is None:
                    continue
                result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                if result.pose_landmarks:
                    found += 1
    finally:
        capture.release()
    return found


def _process_lift(record: dict[str, Any]) -> None:
    lift_id = str(record.get("id", ""))
    video_path = str(record.get("video_path", ""))
    if not lift_id or not video_path:
        return
    try:
        current = _rest(
            "GET", f"lifts?id=eq.{lift_id}",
            params={"select": "id,status,video_path", "limit": "1"},
        ).json()
        if not current or current[0].get("status") != "AI_ANALYZING":
            return
        if current[0].get("video_path") != video_path:
            return
        with tempfile.TemporaryDirectory(prefix="repunit-lift-") as directory:
            video_file = Path(directory) / "proof-video"
            _download_video(video_path, video_file)
            digest, hashes = _sample_hashes(video_file)
            duplicate_of = _find_duplicate(digest, hashes)
            if duplicate_of and duplicate_of != lift_id:
                _set_status(
                    lift_id, "REJECTED",
                    "This video appears to reuse footage already submitted for another lift.",
                )
                return
            _store_fingerprint(lift_id, digest, hashes)
            pose_frames = _pose_screen(video_file)
            if pose_frames < 2:
                _set_status(
                    lift_id, "NEEDS_REVIEW",
                    "The lifter could not be reliably identified in enough frames. Manual review required.",
                )
                return
            _set_status(
                lift_id, "NEEDS_REVIEW",
                f"Screening completed: person detected in {pose_frames} sampled frames and duplicate check passed. "
                "Declared load, repetitions and competition-standard technique are not verified; manual review required.",
            )
    except Exception as error:
        try:
            _set_status(
                lift_id, "NEEDS_REVIEW",
                f"Automatic screening could not finish safely ({type(error).__name__}). Manual review required.",
            )
        except Exception:
            pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "repunit-lift-verifier", "status": "ok"}


@app.post("/webhooks/lift-created")
async def lift_created(
    request: Request,
    background_tasks: BackgroundTasks,
    x_lift_webhook_secret: str | None = Header(default=None),
) -> dict[str, str]:
    if not LIFT_WEBHOOK_SECRET or not hmac.compare_digest(
        x_lift_webhook_secret or "", LIFT_WEBHOOK_SECRET
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    record = payload.get("record") if isinstance(payload, dict) else None
    if not isinstance(record, dict):
        raise HTTPException(status_code=400, detail="Expected database webhook record")
    if record.get("status") != "AI_ANALYZING":
        return {"status": "ignored"}
    background_tasks.add_task(_process_lift, record)
    return {"status": "queued"}
