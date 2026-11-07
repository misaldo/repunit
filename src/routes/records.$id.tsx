import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { exerciseLabel, estimated1RM, validateVideo } from "@/lib/lifts";
import { useUser } from "@/hooks/use-session";
import { toast } from "sonner";

export const Route = createFileRoute("/records/$id")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Lift record — REPUNIT" }, { name: "description", content: "A lift submitted on REPUNIT." }, { property: "og:title", content: "Lift record — REPUNIT" }, { property: "og:description", content: "See the lift and its verification status." }] }),
  component: Record,
});

function Record() {
  const { id } = Route.useParams();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lift", id],
    queryFn: async () => {
      // Fetch the lift independently of the PostgREST profile relationship cache.
      // Lovable preview projects can have stale/missing relationship metadata even
      // when the lift itself is readable.
      const { data: lift, error } = await supabase.from("lifts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!lift) return null;
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", lift.user_id).maybeSingle();
      const l = { ...lift, profiles: profile };
      let video: string | null = null;
      if (lift.video_path) {
        try {
          const { data: signed, error: signedError } = await supabase.storage.from("lift-videos").createSignedUrl(lift.video_path, 3600);
          if (!signedError) video = signed?.signedUrl ?? null;
        } catch {
          video = null;
        }
      }
      return { l, video, videoUnavailable: Boolean(lift.video_path && !video) };
    },
  });
  async function flagLift() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: count, error } = await supabase.rpc("flag_lift", { _lift_id: id });
      if (error) throw error;
      toast.success(Number(count) >= 3 ? "Lift moved under review" : "Flag submitted", {
        description: Number(count) >= 3 ? "The lift is hidden from rankings until video proof is added." : "A total of three different Crew members is required.",
      });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not flag this lift.");
    } finally { setBusy(false); }
  }

  async function addVideoProof(file: File) {
    const validationError = validateVideo(file);
    if (validationError) { toast.error(validationError); return; }
    if (busy || !user) return;
    setBusy(true);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
    try {
      const { error: uploadError } = await supabase.storage.from("lift-videos").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc("attach_lift_video", { _lift_id: id, _video_path: path });
      if (error) {
        await supabase.storage.from("lift-videos").remove([path]);
        throw error;
      }
      toast.success("Video proof added", { description: "Your lift is now back in the rankings." });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload video proof.");
    } finally { setBusy(false); }
  }

  if (isLoading) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  if (isError && !data) return <PageShell><p>Could not load this lift. Please try again.</p><Button className="mt-4" variant="line" onClick={() => refetch()}>Try again</Button></PageShell>;
  if (!data) return <PageShell><p>Record not found.</p></PageShell>;
  const { l, video, videoUnavailable } = data;
  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={l.status} />{l.video_path && <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Video</span>}</div>
      <p className="eyebrow mt-4">{exerciseLabel(l.exercise)} · {l.lifted_on}</p>
      <p className="font-stat mt-2 text-8xl">{Number(l.weight_kg)}<span className="text-2xl text-muted-foreground">kg × {l.reps}</span></p>
      <p className="text-sm text-muted-foreground">Est. 1RM {estimated1RM(Number(l.weight_kg), l.reps)} kg · by{" "}
        {l.profiles && <Link to="/u/$username" params={{ username: l.profiles.username }} className="text-foreground underline">@{l.profiles.username}</Link>}</p>
      {l.description && <p className="mt-4 max-w-xl">{l.description}</p>}
      {video ? <video src={video} controls playsInline className="mt-6 w-full max-w-xl rounded-xl border border-border" /> :
        videoUnavailable ? <p className="mt-6 text-sm text-muted-foreground">Video evidence is temporarily unavailable.</p> : <p className="mt-6 text-sm text-muted-foreground">No video evidence attached.</p>}
      {(l.status === "NEEDS_PROOF" || l.status === "UNDER_REVIEW") && <div className="mt-5 max-w-xl rounded-xl border border-warning/30 bg-warning/5 p-4"><p className="text-sm font-semibold">{l.status === "UNDER_REVIEW" ? "Your Crew flagged this lift." : "This lift needs video proof."}</p><p className="mt-1 text-xs text-muted-foreground">{(l as typeof l & { verification_reason?: string | null }).verification_reason ?? "This result is not counted in rankings until you add a video."}</p></div>}
      {user?.id === l.user_id && l.status !== "VERIFIED" && <div className="mt-5 max-w-xl"><label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-wide text-primary-foreground">{busy ? "Uploading…" : l.video_path ? "Replace video proof" : "Add video proof"}<input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addVideoProof(file); event.currentTarget.value = ""; }} /></label></div>}
      {user && user.id !== l.user_id && <Button variant="line" className="mt-5" disabled={busy} onClick={() => void flagLift()}>Flag lift</Button>}
      <p className="mt-6 text-xs text-muted-foreground">Automatic checks are applied by the database. A lift that needs proof stays out of rankings until its owner attaches a video.</p>
    </PageShell>
  );
}
