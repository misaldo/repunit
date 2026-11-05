import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exerciseLabel } from "@/lib/lifts";
import { LiftVideoDialog } from "@/components/lift-video-dialog";

export function ThroneBanner() {
  const [videoOpen, setVideoOpen] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ["latest-throne-takeover"],
    staleTime: 30000,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: event, error } = await (supabase as any).from("throne_events")
        .select("id,exercise,lifter_id,previous_lifter_id,lift_id,weight_kg,reps,created_at")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!event) return null;
      const ids = [...new Set([event.lifter_id, event.previous_lifter_id].filter(Boolean))];
      const [{ data: profiles, error: profilesError }, { data: lift, error: liftError }] = await Promise.all([
        (supabase as any).from("profiles").select("id,username,display_name,avatar_url").in("id", ids),
        (supabase as any).from("lifts").select("video_path").eq("id", event.lift_id).maybeSingle(),
      ]);
      if (profilesError) throw profilesError;
      if (liftError) throw liftError;
      const profileMap = new Map<string, any>();
      for (const profile of profiles ?? []) profileMap.set(profile.id, profile);
      return {
        ...event,
        lifter: profileMap.get(event.lifter_id) ?? null,
        previous: event.previous_lifter_id ? profileMap.get(event.previous_lifter_id) ?? null : null,
        hasVideo: Boolean(lift?.video_path),
      };
    },
  });

  if (isError || !data?.lifter) return null;
  const name = data.lifter.display_name || data.lifter.username;
  return (
    <section aria-live="polite" className="throne-enter relative mb-6 overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/[0.12] via-card to-primary/[0.08] p-4 shadow-[0_12px_40px_-28px_rgba(245,158,11,.65)] sm:p-5">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl"/>
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300"><Crown className="h-6 w-6"/></div>
        <Avatar className="h-11 w-11 border border-amber-300/40"><AvatarImage src={data.lifter.avatar_url ?? undefined}/><AvatarFallback>{data.lifter.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">CHANGE ON THE THRONE · GLOBAL #1</p>
          <p className="mt-1 text-sm font-bold leading-snug"><Link to="/u/$username" params={{username:data.lifter.username}} className="hover:text-primary">{name}</Link> just took 1st place with <span className="text-primary">{Number(data.weight_kg).toLocaleString("en-US")} kg</span> {exerciseLabel(data.exercise).toLowerCase()}.</p>
          {data.previous?.username && <p className="mt-1 text-[11px] text-muted-foreground">The previous leader was @{data.previous.username} · {new Date(data.created_at).toLocaleString()}</p>}
        </div>
        {data.hasVideo && <button type="button" onClick={() => setVideoOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-primary-foreground transition hover:brightness-110"><span>Watch the lift</span><ArrowUpRight className="h-4 w-4"/></button>}
      <LiftVideoDialog liftId={videoOpen ? data.lift_id : null} open={videoOpen} onOpenChange={setVideoOpen} />
      </div>
    </section>
  );
}
