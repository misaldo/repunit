// @ts-nocheck -- references planned backend features not yet set up
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXERCISES, validateVideo, type Exercise } from "@/lib/lifts";
import { getFunComparison, formatLiftVolume } from "@/components/fun-stats";

export const Route = createFileRoute("/_authenticated/records/new")({
  head: () => ({ meta: [{ property: "og:title", content: "Submit a lift — REPUNIT" }, { property: "og:description", content: "Log a new lift with video evidence." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Submit a lift — REPUNIT" }, { name: "description", content: "Log a new lift with video evidence." }] }),
  component: NewRecord,
});

function NewRecord() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const savedExercise = typeof window !== "undefined" ? window.localStorage.getItem("repunit.lastExercise") : null;
  const savedWeight = typeof window !== "undefined" ? window.localStorage.getItem("repunit.lastWeight") : null;
  const savedReps = typeof window !== "undefined" ? window.localStorage.getItem("repunit.lastReps") : null;
  const hasSavedPrefill = Boolean(savedWeight);
  const [exercise, setExercise] = useState<Exercise>(EXERCISES.some((item) => item.id === savedExercise && item.id !== "pullup") ? savedExercise as Exercise : "bench");
  const [weight, setWeight] = useState(savedWeight ?? "");
  const [reps, setReps] = useState(savedReps ?? "1");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { data: lastLift } = useQuery({
    queryKey: ["last-pr-prefill", user.id],
    enabled: !hasSavedPrefill,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("lifts").select("exercise,weight_kg,reps")
        .eq("user_id", user.id).order("lifted_on", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!lastLift || hasSavedPrefill || !EXERCISES.some((item) => item.id === lastLift.exercise && item.id !== "pullup")) return;
    setExercise(lastLift.exercise as Exercise);
    setWeight(String(lastLift.weight_kg));
    setReps(String(lastLift.reps ?? 1));
  }, [lastLift, hasSavedPrefill]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const weight = Number(f.get("weight")); const reps = Number(f.get("reps"));
    if (!Number.isFinite(weight) || !Number.isInteger(reps) || weight < 0 || reps < 1) { toast.error("Enter a valid weight and whole number of reps."); return; }
    const file = f.get("video") as File | null;
    if (!file || file.size === 0) { toast.error("Video proof is required to submit a lift."); return; }
    let video_path: string | null = null;
    setBusy(true);
    try {
      {
        const err = validateVideo(file); if (err) throw new Error(err);
        video_path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your session expired. Please sign in again.");
        const storageUrl = import.meta.env["VITE_SUPABASE_URL"];
        const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!storageUrl || !publishableKey) throw new Error("Storage is not configured.");
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const encodedPath = video_path!.split("/").map(encodeURIComponent).join("/");
          xhr.open("POST", `${storageUrl.replace(/\/+$/, "")}/storage/v1/object/lift-videos/${encodedPath}`);
          xhr.setRequestHeader("apikey", publishableKey);
          xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.setRequestHeader("x-upsert", "false");
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else {
              let message = "Video upload failed.";
              try { message = JSON.parse(xhr.responseText).message || message; } catch { /* use fallback */ }
              reject(new Error(message));
            }
          };
          xhr.onerror = () => reject(new Error("Network error while uploading the video."));
          xhr.onabort = () => reject(new Error("Video upload was cancelled."));
          xhr.send(file);
        });
      }
      const { data, error } = await supabase.from("lifts").insert({
        user_id: user.id, exercise, weight_kg: weight, reps,
        lifted_on: String(f.get("date")), description: null, video_path,
      }).select("id,status,verification_reason").single();
      if (error) throw error;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("repunit.lastExercise", exercise);
        window.localStorage.setItem("repunit.lastWeight", String(weight));
        window.localStorage.setItem("repunit.lastReps", String(reps));
      }
      const crewFunFact = async () => {
        try {
          const { data: memberships } = await supabase.from("crew_members").select("crew_id").eq("user_id", user.id);
          const crewIds = [...new Set((memberships ?? []).map((m) => m.crew_id))];
          if (crewIds.length) {
            const { data: members } = await supabase.from("crew_members").select("user_id").in("crew_id", crewIds);
            const memberIds = [...new Set((members ?? []).map((m) => m.user_id))];
            const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
            const { data: monthLifts } = await supabase.from("lifts").select("weight_kg,reps").in("user_id", memberIds).eq("status", "VERIFIED").gte("created_at", monthStart.toISOString());
            const total = (monthLifts ?? []).reduce((sum, lift) => sum + Number(lift.weight_kg) * Math.max(1, Number(lift.reps ?? 1)), 0);
            const comparison = getFunComparison(total);
            if (comparison) return `Your Crew moved ${formatLiftVolume(total)} this month — about ${comparison.label}.`;
          }
        } catch { /* The lift itself is saved; the fun fact is optional. */ }
        const total = Number(weight) * Number(reps);
        const comparison = getFunComparison(total);
        return comparison ? `You just moved ${formatLiftVolume(total)} — about ${comparison.label}.` : "Your result is on REPUNIT.";
      };
      const funFact = await crewFunFact();
      if ((data as { status?: string }).status === "NEEDS_PROOF" || (data as { status?: string }).status === "UNDER_REVIEW") {
        toast.warning("Lift saved — proof needed", { description: `${data.verification_reason ?? "This lift is not counted in rankings yet."} ${funFact}` });
      } else {
        toast.success("PR logged", { description: funFact });
      }
      navigate({ to: "/records/$id", params: { id: data.id } });
    } catch (err) {
      console.error("[REPUNIT] Lift submission failed", err);
      let cleanupFailed = false;
      if (video_path) {
        const { error: cleanupError } = await supabase.storage.from("lift-videos").remove([video_path]);
        cleanupFailed = Boolean(cleanupError);
        if (cleanupError) console.error("[REPUNIT] Uploaded lift video cleanup failed", cleanupError);
      }
      if (cleanupFailed) {
        toast.error("Your lift could not be saved and its uploaded video could not be removed. Please contact support.");
      } else {
        const errorObject = err && typeof err === "object" ? err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } : null;
        const message = err instanceof Error ? err.message : typeof errorObject?.message === "string" ? errorObject.message : "";
        const code = typeof errorObject?.code === "string" ? errorObject.code : "";
        const safeMessages = [
          "Use an MP4, MOV or WebM video.",
          "Video must be 100 MB or smaller.",
          "Your session expired. Please sign in again.",
          "Storage is not configured.",
          "Network error while uploading the video.",
          "Video upload was cancelled.",
        ];
        const detail = safeMessages.includes(message)
          ? message
          : message || "The server returned an unknown error.";
        toast.error("Could not submit your lift.", {
          description: code ? `${detail} (Code: ${code})` : detail,
          duration: 9000,
        });
      }
    } finally { setBusy(false); setUploadProgress(null); }
  }
  return (
    <PageShell>
      <div className="mb-5"><p className="eyebrow text-primary">QUICK PR LOG</p><h1 className="font-stat mt-2 text-4xl uppercase sm:text-5xl">Log your PR<span className="text-primary">.</span></h1><p className="mt-2 text-sm text-muted-foreground">A few taps and your Crew sees the result.</p></div>
      <form onSubmit={submit} className="mt-6 max-w-md space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <input type="hidden" name="date" value={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })()} />
        <div className="space-y-1.5"><Label htmlFor="exercise">Exercise</Label>
          <select id="exercise" name="exercise" value={exercise} onChange={(event) => setExercise(event.target.value as Exercise)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">{EXERCISES.filter((x) => x.id !== "pullup").map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="weight">Weight (kg)</Label><Input id="weight" name="weight" value={weight} onChange={(event) => setWeight(event.target.value)} type="number" step="0.01" min="0" max="9999.99" inputMode="decimal" placeholder="100" className="h-12 text-lg font-bold" required /></div>
          <div className="space-y-1.5"><Label htmlFor="reps">Reps</Label><Input id="reps" name="reps" value={reps} onChange={(event) => setReps(event.target.value)} type="number" min="1" max="1000" inputMode="numeric" className="h-12 text-lg font-bold" required /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="video">Video proof <span className="text-primary">(required)</span></Label><Input id="video" name="video" type="file" accept="video/mp4,video/quicktime,video/webm" required className="min-h-11 w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-primary" /></div>
        {uploadProgress !== null && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Uploading video</span><span>{uploadProgress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Video upload progress">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        <Button variant="hero" className="h-13 w-full text-base font-black uppercase tracking-wide" disabled={busy}>{busy ? (uploadProgress === null ? "Saving PR…" : `Uploading ${uploadProgress}%`) : "Log PR"}</Button>
        <p className="text-center text-[11px] text-muted-foreground">Every lift requires an MP4, MOV or WebM video (max 100 MB). Lifts without video cannot be submitted.</p>
      </form>
    </PageShell>
  );
}
