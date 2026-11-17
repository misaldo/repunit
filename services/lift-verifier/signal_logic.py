"""Conservative, dependency-free decision helpers for REPUNIT lift screening.

A lift is VERIFIED only when repetition evidence matches and a separately validated
load recognizer proves the complete barbell load, including both sleeves and bar mass.
Unknown or incomplete evidence always produces NOT_VERIFIED.
"""
from __future__ import annotations

from collections.abc import Sequence


STANDARD_BAR_MASS_KG = 20.0


def is_verified_duplicate(status: str | None) -> bool:
    """Only a lift already VERIFIED makes identical footage a duplicate."""
    return status == "VERIFIED"


def count_angle_cycles(values: Sequence[float], *, min_amplitude: float = 28.0,
                       min_separation: int = 5) -> int | None:
    """Count complete low-to-high angle cycles using thresholds from the clip."""
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


def total_barbell_load(plates_left_kg: Sequence[float], plates_right_kg: Sequence[float]) -> float | None:
    """Add REPUNIT's fixed 20 kg standard bar to complete, uniquely counted plate stacks.

    The caller must independently prove both sleeves are fully visible and each
    physical plate is counted exactly once. Empty or invalid stacks fail closed.
    """
    if not plates_left_kg or not plates_right_kg:
        return None
    values = [float(value) for value in (*plates_left_kg, *plates_right_kg)]
    if any(value <= 0 for value in values):
        return None
    return round(STANDARD_BAR_MASS_KG + sum(values), 2)


def stable_plate_load(observations: Sequence[float], *, min_frames: int = 3,
                      tolerance_kg: float = 1.0) -> float | None:
    """Return a repeated OCR estimate only when enough independent readings agree.

    This is a stability helper, not a complete barbell-load reconstruction.
    """
    if len(observations) < min_frames:
        return None
    rounded = [round(float(value) * 2) / 2 for value in observations]
    candidates = sorted(set(rounded))
    for candidate in candidates:
        agreeing = [value for value in rounded if abs(value - candidate) <= tolerance_kg]
        if len(agreeing) >= min_frames:
            return round(sum(agreeing) / len(agreeing) * 2) / 2
    return None


def decide_lift_status(
    reps_match: bool | None,
    weight_match: bool | None,
    *,
    weight_evidence_complete: bool = False,
) -> str:
    """Verify only when reps and a complete, independently validated barbell load match.

    Completeness must come from a recognizer that tracks unique plates, confirms both
    sleeves are fully visible, and identifies the bar mass. OCR confidence alone
    is never sufficient.
    """
    if reps_match is True and weight_match is True and weight_evidence_complete is True:
        return "VERIFIED"
    return "NOT_VERIFIED"
