import type { Database } from "@/integrations/supabase/types";

export type Exercise = Database["public"]["Enums"]["exercise"];
export type LiftStatus = Database["public"]["Enums"]["lift_status"];

export const EXERCISES: { id: Exercise; label: string; short: string; standard: string }[] = [
  { id: "bench", label: "Bench Press", short: "BENCH", standard: "Touch-and-go, bar to chest, full lockout." },
  { id: "squat", label: "Squat", short: "SQUAT", standard: "Hip crease below top of knee, full lockout." },
  { id: "deadlift", label: "Deadlift", short: "DEAD", standard: "Conventional or sumo, full hip and knee lockout." },
  { id: "ohp", label: "Overhead Press", short: "OHP", standard: "Standing strict press, no leg drive." },
  { id: "pullup", label: "Pull-up", short: "PULL", standard: "Added weight in kg. Dead hang to chin over bar." },
];

export const exerciseLabel = (e: Exercise) => EXERCISES.find((x) => x.id === e)?.label ?? e;

export const STATUS_META: Record<LiftStatus, { label: string; tone: "verified" | "pending" | "warn" | "bad" | "ai" }> = {
  PENDING: { label: "Unverified", tone: "pending" },
  AI_ANALYZING: { label: "Analyzing", tone: "ai" },
  AI_CHECKED: { label: "AI checked", tone: "ai" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warn" },
  NEEDS_PROOF: { label: "Needs proof", tone: "warn" },
  UNDER_REVIEW: { label: "Under review", tone: "warn" },
  VERIFIED: { label: "Verified", tone: "verified" },
  REJECTED: { label: "Rejected", tone: "bad" },
};

/** Estimated 1-rep max (Epley). Single reps return the weight itself. */
export function estimated1RM(weight: number, reps: number) {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function validateVideo(file: File): string | null {
  if (!VIDEO_TYPES.includes(file.type)) return "Use an MP4, MOV or WebM video.";
  if (file.size > VIDEO_MAX_BYTES) return "Video must be 100 MB or smaller.";
  return null;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
