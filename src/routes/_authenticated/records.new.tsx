import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EXERCISES, validateVideo, type Exercise } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/records/new")({
  head: () => ({ meta: [{ property: "og:title", content: "Submit a lift — REPUNIT" }, { property: "og:description", content: "Log a new lift with video evidence." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Submit a lift — REPUNIT" }, { name: "description", content: "Log a new lift with video evidence." }] }),
  component: NewRecord,
});

function NewRecord() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const weight = Number(f.get("weight")); const reps = Number(f.get("reps"));
    if (!(weight >= 0 && weight <= 600) || !(reps >= 1 && reps <= 100)) { toast.error("Check weight and reps."); return; }
    const file = f.get("video") as File | null;
    let video_path: string | null = null;
    setBusy(true);
    try {
      if (file && file.size > 0) {
        const err = validateVideo(file); if (err) throw new Error(err);
        video_path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your session expired. Please sign in again.");
        const storageUrl = import.meta.env.VITE_SUPABASE_URL;
        const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
        user_id: user.id, exercise: f.get("exercise") as Exercise, weight_kg: weight, reps,
        lifted_on: String(f.get("date")), description: String(f.get("description") || "").slice(0, 500) || null, video_path,
      }).select("id").single();
      if (error) throw error;
      toast.success("Lift submitted");
      navigate({ to: "/records/$id", params: { id: data.id } });
    } catch (err) {
      if (video_path) {
        const { error: cleanupError } = await supabase.storage.from("lift-videos").remove([video_path]);
        if (cleanupError) toast.error("The lift was not saved, and its video could not be removed. Please try again later.");
      }
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); setUploadProgress(null); }
  }
  return (
    <PageShell>
      <h1 className="font-stat text-6xl uppercase">Submit a lift</h1>
      <form onSubmit={submit} className="mt-6 max-w-md space-y-4">
        <div className="space-y-1.5"><Label htmlFor="exercise">Exercise</Label>
          <select id="exercise" name="exercise" className="h-10 w-full rounded-md border border-input bg-card px-3">{EXERCISES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="weight">Weight (kg)</Label><Input id="weight" name="weight" type="number" step="0.5" min="0" max="600" inputMode="decimal" required /></div>
          <div className="space-y-1.5"><Label htmlFor="reps">Reps</Label><Input id="reps" name="reps" type="number" min="1" max="100" defaultValue={1} required /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="date">Date</Label><Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
        <div className="space-y-1.5"><Label htmlFor="video">Video (MP4/MOV/WebM, max 100 MB)</Label><Input id="video" name="video" type="file" accept="video/mp4,video/quicktime,video/webm" /></div>
        <div className="space-y-1.5"><Label htmlFor="description">Notes</Label><Textarea id="description" name="description" maxLength={500} /></div>
        {uploadProgress !== null && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Uploading video</span><span>{uploadProgress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Video upload progress">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        <Button variant="hero" className="h-12 w-full" disabled={busy}>{busy ? (uploadProgress === null ? "Saving lift…" : `Uploading ${uploadProgress}%`) : "Submit"}</Button>
        <p className="text-xs text-muted-foreground">New lifts start as Unverified.</p>
      </form>
    </PageShell>
  );
}
