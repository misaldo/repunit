import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Users, ShieldCheck, Crown, ArrowLeft, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/crews/new")({
  head: () => ({ meta: [{ title: "Create crew — REPUNIT" }, { name: "description", content: "Build your REPUNIT crew." }] }),
  component: NewCrew,
});

function NewCrew() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [capacity, setCapacity] = useState("20");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      // Create the crew without sending max_members in the REST payload.
      // This avoids failures when PostgREST has a stale schema cache.
      const { data, error } = await supabase.from("crews").insert({
        name: String(f.get("name")).trim().slice(0, 40),
        description: String(f.get("description") || "").slice(0, 280) || null,
        owner_id: user.id,
      }).select("id").single();
      if (error) throw error;

      // Capacity is optional: if its RPC is temporarily unavailable, keep the
      // crew and its database default (20) instead of deleting a valid crew.
      const { error: capacityError } = await supabase.rpc("update_crew_capacity", {
        _crew: data.id,
        _max_members: Number(capacity),
      });
      if (capacityError) {
        console.warn("Crew created with default capacity because capacity update failed:", capacityError.message);
        toast.message("Crew created with the default capacity of 20 members.");
      }

      toast.success("Crew created — you're the admin");
      navigate({ to: "/crews/$id", params: { id: data.id } });
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : err instanceof Error ? err.message : "Unknown database error";
      toast.error(`Could not create crew: ${message}`);
    }
    finally { setBusy(false); }
  }
  return <PageShell><div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-border bg-card">
    <div className="relative border-b border-border bg-gradient-to-br from-primary/20 via-card to-card p-6 md:p-9">
      <Button asChild size="sm" variant="ghost" className="mb-5 -ml-3"><a href="/crews"><ArrowLeft className="mr-2 h-4 w-4"/>Back to crews</a></Button>
      <div className="flex items-center gap-3 text-primary"><Users className="h-5 w-5"/><p className="eyebrow">BUILD YOUR SQUAD</p></div>
      <h1 className="font-stat mt-2 text-5xl uppercase md:text-6xl">Create crew</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">Bring your training partners together. Compete, share progress and climb the rankings as one unit.</p>
    </div>
    <form onSubmit={submit} className="space-y-6 p-5 md:p-9">
      <div className="space-y-2"><Label htmlFor="name">Crew name</Label><Input id="name" name="name" minLength={2} maxLength={40} placeholder="e.g. IRON LEGION" required className="h-12"/></div>
      <div className="space-y-2"><Label htmlFor="description">Crew bio <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="description" name="description" maxLength={280} placeholder="What's your crew about?" rows={3}/></div>
      <div><Label>Maximum members</Label><p className="mt-1 text-xs text-muted-foreground">Choose the squad size. You can change it later as admin.</p>
        <div className="mt-3 grid grid-cols-4 gap-2">{["5","10","20","30","40","50","75","100"].map(n=><button type="button" key={n} onClick={()=>setCapacity(n)} className={`rounded-xl border px-2 py-3 text-sm font-bold transition ${capacity===n?"border-primary bg-primary/15 text-primary":"border-border bg-background hover:border-primary/40"}`}>{n}</button>)}</div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-elevated/70 px-4 py-3"><span className="text-sm text-muted-foreground">Crew capacity</span><span className="font-stat text-2xl">{capacity} <span className="text-xs text-muted-foreground">MEMBERS</span></span></div>
      </div>
      <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2">
        <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary"/><div><p className="text-sm font-bold">You're the admin</p><p className="text-xs text-muted-foreground">Manage your crew</p></div></div>
        <div className="flex items-center gap-3"><Dumbbell className="h-5 w-5 text-primary"/><div><p className="text-sm font-bold">Crew leaderboard</p><p className="text-xs text-muted-foreground">Compare verified lifts</p></div></div>
      </div>
      <Button variant="hero" className="h-12 w-full text-sm font-black tracking-widest" disabled={busy}>{busy?"CREATING YOUR CREW…":<><Crown className="mr-2 h-4 w-4"/>CREATE YOUR CREW</>}</Button>
    </form>
  </div></PageShell>;
}
