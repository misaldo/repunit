import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Plus, Users, UserPlus, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/crews/")({
  head: () => ({ meta: [{ title: "Crews — REPUNIT" }, { name: "description", content: "Your training squad." }] }),
  component: Crews,
});

function Crews() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["my-crews", user.id],
    queryFn: async () => {
      const { data: memberships, error } = await (supabase as any).from("crew_members")
        .select("crew_id, role").eq("user_id", user.id);
      if (error) throw error;
      const crewIds = (memberships ?? []).map((m: any) => m.crew_id);
      if (!crewIds.length) return [];
      const { data: crews, error: crewsError } = await (supabase as any).from("crews")
        .select("id, name, description").in("id", crewIds);
      if (crewsError) throw crewsError;
      const crewById = new Map((crews ?? []).map((crew: any) => [crew.id, crew]));
      return (memberships ?? []).map((membership: any) => ({
        ...membership, crews: crewById.get(membership.crew_id) ?? null,
      }));
    },
  });
  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    try { const { data: id, error } = await supabase.rpc("join_crew", { _code: code }); if (error) throw error; toast.success("Welcome to the crew"); navigate({ to: "/crews/$id", params: { id } }); }
    catch { toast.error("Could not join this crew. Check the invite code and try again."); }
    finally { setBusy(false); }
  }
  const adminCount = data.filter((m:any)=>m.role==="admin").length;
  return <PageShell>
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-9">
      <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl"/>
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div><p className="eyebrow text-primary">STRENGTH IS BETTER TOGETHER</p><h1 className="font-stat mt-2 text-6xl uppercase md:text-7xl">Your crews</h1><p className="mt-3 max-w-lg text-sm text-muted-foreground">Your people. Your lifts. Your leaderboard. Build a squad and make every rep count.</p></div>
        <Button asChild variant="hero" className="h-12 shrink-0 px-6"><Link to="/crews/new"><Plus className="mr-2 h-4 w-4"/>Create a crew</Link></Button>
      </div>
      <div className="relative mt-7 grid grid-cols-2 gap-2 border-t border-border/70 pt-5">
        <div><p className="font-stat text-3xl">{data.length}</p><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Crews joined</p></div>
        <div><p className="font-stat text-3xl">{adminCount}</p><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Admin roles</p></div>
      </div>
    </div>
    <section className="mt-8 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary"/><h2 className="font-bold">Got an invite?</h2></div>
      <form onSubmit={join} className="mt-3 flex gap-2"><Input name="code" aria-label="Invite code" placeholder="Enter crew invite code" required className="h-11 font-mono uppercase tracking-wider"/><Button variant="hero" disabled={busy} className="shrink-0">{busy?"Joining…":"Join crew"}</Button></form>
    </section>
    <div className="mt-9 flex items-end justify-between"><div><p className="eyebrow">YOUR SQUADS</p><h2 className="font-stat mt-1 text-3xl uppercase">Crew list</h2></div><span className="text-xs text-muted-foreground">{data.length} joined</span></div>
    {isLoading&&<p className="mt-5 text-sm text-muted-foreground">Loading your crews…</p>}
    {isError&&<div className="mt-5"><p>Showing your last loaded crews. Refresh to check for updates.</p><Button variant="line" className="mt-3" onClick={()=>void refetch()}>Retry</Button></div>}
    {!isLoading&&!isError&&data.length===0&&<div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-10 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground"/><h3 className="mt-3 font-bold">No crew yet</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Create your own squad or join one with an invite code. Your next PR could be a team effort.</p><Button asChild variant="hero" className="mt-5"><Link to="/crews/new"><Plus className="mr-2 h-4 w-4"/>Create your first crew</Link></Button></div>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">{data.map((m:any)=>m.crews&&<Link key={m.crew_id} to="/crews/$id" params={{id:m.crews.id}} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_12px_45px_-24px_hsl(var(--primary)/0.35)]">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/15"/>
      <div className="relative flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Users className="h-6 w-6"/></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${m.role==="admin"?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground"}`}>{m.role==="admin"?"Admin":"Member"}</span></div>
      <div className="relative mt-4 flex items-center justify-between"><div><h3 className="text-xl font-black uppercase tracking-wide">{m.crews.name}</h3><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.crews.description||"No crew bio yet."}</p></div><ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-primary"/></div>
      <div className="relative mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5"/>REPUNIT squad</span><span className="font-bold text-foreground">Joined</span></div>
    </Link>)}</div>
  </PageShell>;
}
