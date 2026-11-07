// @ts-nocheck -- references backend features not yet set up; typed once their tables exist
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Swords, Trophy, Clock3, Check, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AvatarChip } from "@/components/avatar-chip";

export const Route = createFileRoute("/_authenticated/challenges")({
  head: () => ({ meta: [{ title: "Challenges — REPUNIT" }, { name: "description", content: "Call-outs, rivalries and one-to-one lifting challenges." }] }),
  component: ChallengesPage,
});

type Challenge = {
  id: string; challenger_id: string; challenged_id: string; exercise: string;
  target_weight_kg: number; status: string; winner_id: string | null;
  due_at: string; created_at: string; source_lift_id?: string | null;
};

const exerciseNames: Record<string,string> = { bench: "Bench press", squat: "Squat", deadlift: "Deadlift", ohp: "Overhead press", pullup: "Pull-up" };

function ChallengesPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: challenges = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["lifter-challenges", user.id],
    queryFn: async () => {
      await (supabase as any).rpc("expire_lifter_challenges");
      await (supabase as any).from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("kind", "challenge").is("read_at", null);
      const { data, error } = await (supabase as any).from("lifter_challenges").select("*")
        .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Challenge[];
    },
  });
  const profileIds = useMemo(() => [...new Set(challenges.flatMap(c => [c.challenger_id,c.challenged_id]))], [challenges]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["challenge-profiles", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", profileIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const byId = new Map(profiles.map((p:any) => [p.id,p]));
  const sourceLiftIds = useMemo(() => challenges.map(c => c.source_lift_id).filter((id): id is string => !!id), [challenges]);
  const { data: sourceLifts = [] } = useQuery({
    queryKey: ["challenge-source-lifts", sourceLiftIds],
    enabled: sourceLiftIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lifts").select("id,weight_kg,reps,exercise").in("id", sourceLiftIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const liftById = new Map(sourceLifts.map((lift:any) => [lift.id,lift]));

  async function respond(challenge: Challenge, status: "accepted" | "ignored") {
    if (busyId) return;
    setBusyId(challenge.id);
    const update: Record<string,unknown> = { status };
    if (status === "accepted") update.accepted_at = new Date().toISOString();
    const { error } = await (supabase as any).from("lifter_challenges").update(update)
      .eq("id",challenge.id).eq("challenged_id",user.id).eq("status","pending");
    if (error) toast.error("Could not update this challenge. Check your connection and try again.");
    else {
      toast.success(status === "accepted" ? "Challenge accepted. Let’s get to work." : "Call-out ignored");
      await qc.invalidateQueries({ queryKey: ["lifter-challenges", user.id] });
    }
    setBusyId(null);
  }
  const pending = challenges.filter(c => c.status === "pending");
  const active = challenges.filter(c => c.status === "accepted");
  const finished = challenges.filter(c => ["completed","failed","ignored","expired"].includes(c.status));
  function ChallengeCard({ challenge }: { challenge: Challenge }) {
    const incoming = challenge.challenged_id === user.id;
    const other = byId.get(incoming ? challenge.challenger_id : challenge.challenged_id) as any;
    const winner = challenge.winner_id ? byId.get(challenge.winner_id) as any : null;
    const sourceLift = challenge.source_lift_id ? liftById.get(challenge.source_lift_id) as any : null;
    const statusLabel = challenge.status === "accepted" ? "IN PROGRESS" : challenge.status.toUpperCase();
    return <article className="challenge-enter relative overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary/[0.07] blur-3xl"/>
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarChip name={other?.username ?? "Lifter"} url={other?.avatar_url} className="h-11 w-11"/>
            <div className="min-w-0"><p className="truncate font-bold">{other?.display_name ?? other?.username ?? "REPUNIT lifter"}</p><p className="text-xs text-muted-foreground">{incoming ? "Called you out" : "Your call-out"} · {new Date(challenge.created_at).toLocaleDateString()}</p></div>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black tracking-widest ${challenge.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : challenge.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-primary/30 bg-primary/10 text-primary"}`}>{statusLabel}</span>
        </div>
        {sourceLift && <p className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-sm">{other?.display_name ?? other?.username ?? "Your friend"} just {sourceLift.exercise === "squat" ? "squatted" : sourceLift.exercise === "bench" ? "benched" : sourceLift.exercise === "deadlift" ? "deadlifted" : "lifted"} <strong>{Number(sourceLift.weight_kg).toLocaleString()} kg</strong>. Think you can do <strong>{Number(challenge.target_weight_kg).toLocaleString()} kg?</strong></p>}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div><p className="eyebrow">{exerciseNames[challenge.exercise] ?? challenge.exercise}</p><p className="font-stat mt-1 text-4xl">{Number(challenge.target_weight_kg).toLocaleString()}<span className="ml-1 text-base text-muted-foreground">kg</span></p><p className="mt-1 text-xs text-muted-foreground">{incoming ? "Your target to beat" : "Target set for your friend"}</p></div>
          <div className="text-right text-xs text-muted-foreground"><Clock3 className="ml-auto mb-1 h-4 w-4"/>{challenge.status === "completed" ? "Finished" : challenge.status === "failed" ? "Time expired" : `Until ${new Date(challenge.due_at).toLocaleDateString()}`}</div>
        </div>
        {challenge.status === "pending" && incoming && <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="hero" disabled={busyId===challenge.id} onClick={()=>void respond(challenge,"accepted")}><Check className="mr-2 h-4 w-4"/>Accept</Button><Button variant="line" disabled={busyId===challenge.id} onClick={()=>void respond(challenge,"ignored")}><X className="mr-2 h-4 w-4"/>Ignore</Button></div>}
        {challenge.status === "accepted" && <p className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">Challenge live. Log a verified {exerciseNames[challenge.exercise] ?? challenge.exercise} at the target weight before the deadline.</p>}
        {challenge.status === "completed" && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm"><Trophy className="h-4 w-4 text-emerald-400"/><span>Winner: <strong>{winner?.display_name ?? winner?.username ?? (challenge.winner_id === user.id ? "You" : "Opponent")}</strong></span></div>}
        {challenge.status === "failed" && <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4"/>Time ran out. Winner: <strong>{winner?.display_name ?? winner?.username ?? "Original challenger"}</strong></div>}
        {challenge.status === "ignored" && <p className="mt-3 text-xs text-muted-foreground">Call-out ignored.</p>}
      </div>
    </article>;
  }
  return <PageShell>
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl"/>
      <div className="relative"><p className="eyebrow text-primary">NO EXCUSES · JUST NUMBERS</p><div className="mt-2 flex items-center gap-3"><Swords className="h-9 w-9 text-primary"/><h1 className="font-stat text-5xl uppercase sm:text-7xl">Challenges</h1></div><p className="mt-3 max-w-xl text-sm text-muted-foreground">Your friends called you out. Accept the target, hit the lift and put your name on the result.</p><div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest"><span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-primary">{pending.length} new call-outs</span><span className="rounded-full border border-border bg-background px-3 py-2 text-muted-foreground">{active.length} active</span><span className="rounded-full border border-border bg-background px-3 py-2 text-muted-foreground">{finished.filter(c=>c.status==="completed"||c.status==="failed").length} finished</span></div></div>
    </div>
    {isLoading ? <p className="py-10 text-sm text-muted-foreground">Loading challenges…</p> : isError ? <div className="mt-6 rounded-xl border border-border p-5"><p>Challenges could not be loaded. Check your connection and try again.</p><Button variant="line" className="mt-3" onClick={()=>void refetch()}>Try again</Button></div> : <>
      <section className="mt-7"><div className="mb-3 flex items-center gap-2"><Zap className="h-5 w-5 text-primary"/><h2 className="font-stat text-2xl uppercase">New call-outs</h2></div>{pending.length ? <div className="grid gap-3 md:grid-cols-2">{pending.map(c=><ChallengeCard key={c.id} challenge={c}/>)}</div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No new call-outs. When a friend logs a lift, you’ll see it here.</p>}</section>
      <section className="mt-8"><h2 className="mb-3 font-stat text-2xl uppercase">Active</h2>{active.length ? <div className="grid gap-3 md:grid-cols-2">{active.map(c=><ChallengeCard key={c.id} challenge={c}/>)}</div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No active challenges. Time to call someone out.</p>}</section>
      <section className="mt-8"><h2 className="mb-3 font-stat text-2xl uppercase">Results</h2>{finished.length ? <div className="grid gap-3 md:grid-cols-2">{finished.map(c=><ChallengeCard key={c.id} challenge={c}/>)}</div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Your wins and losses will show here.</p>}</section>
    </>}
  </PageShell>;
}
