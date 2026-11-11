"""Conservative, dependency-free signal helpers for lift-video screening.

These helpers can reject ambiguous measurements, but are not a validated
competition-lift judge and must never be used as sole proof for VERIFIED.
"""
from __future__ import annotations

from collections.abc import Sequence


def count_angle_cycles(values: Sequence[float], *, min_amplitude: float = 28.0,
                       min_separation: int = 5) -> int | None:
    """Count complete low-to-high angle cycles using thresholds from the clip.

    Returns None when the clip has too little motion to support a count.
    The first partial movement is not counted unless a low phase was observed.
    """
    if len(values) < 12:
        return None
    low_value, high_value = min(values), max(values)
    amplitude = high_value - low_value
    if amplitude < min_amplitude:
        return None

    low_threshold = low_value + amplitude * 0.30
    high_threshold = low_value + amplitude * 0.70
    saw_low = False
    last_rep_at = -min_separation
    reps = 0
    for index, value in enumerate(values):
        if value <= low_threshold:
            saw_low = True
        elif value >= high_threshold and saw_low:
            if index - last_rep_at >= min_separation:
                reps += 1
                last_rep_at = index
                saw_low = False
    return reps if reps > 0 else None


def stable_plate_load(observations: Sequence[float], *, min_frames: int = 3,
                      tolerance_kg: float = 1.0) -> float | None:
    """Return a repeated OCR load estimate only when enough frames agree."""
    if len(observations) < min_frames:
        return None
    rounded = [round(float(value) * 2) / 2 for value in observations]
    candidates = sorted(set(rounded))
    for candidate in candidates:
        agreeing = [value for value in rounded if abs(value - candidate) <= tolerance_kg]
        if len(agreeing) >= min_frames:
            return round(sum(agreeing) / len(agreeing) * 2) / 2
    return None
