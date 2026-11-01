import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLeaderboard, Podium, RankList } from "@/components/leaderboard-list";
import { EXERCISES, type Exercise } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/crews/$id")({
  head: () => ({ meta: [{ title: "Crew — REPUNIT" }, { name: "description", content: "Crew leaderboard." }] }),
  component: Crew,
});

function Crew() {
  const { id } = Route.useParams();
  const [ex, setEx] = useState<Exercise>("bench");
  const { data } = useQuery({
    queryKey: ["crew", id],
    queryFn: async () => {
      const { data: c } = await supabase.from("crews").select("id, name, description").eq("id", id).maybeSingle();
      const { data: code } = await supabase.rpc("crew_invite_code", { _crew: id });
      const { count } = await supabase.from("crew_members").select("*", { count: "exact", head: true }).eq("crew_id", id);
      return { c, code, count };
    },
  });
  const { data: rows = [] } = useLeaderboard(ex, id);
  if (!data?.c) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  return (
    <PageShell>
      <p className="eyebrow">{data.count} members</p>
      <h1 className="font-stat mt-2 text-6xl uppercase">{data.c.name}</h1>
      {data.c.description && <p className="mt-2 text-muted-foreground">{data.c.description}</p>}
      {data.code && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <span className="text-sm">Invite code: <b className="font-mono">{data.code}</b></span>
          <Button size="sm" variant="line" onClick={() => { navigator.clipboard.writeText(data.code!); toast.success("Copied"); }}>Copy</Button>
        </div>
      )}
      <div className="mt-6 flex gap-2 overflow-x-auto">
        {EXERCISES.map((e) => <Button key={e.id} size="sm" variant={e.id === ex ? "hero" : "line"} onClick={() => setEx(e.id)}>{e.short}</Button>)}
      </div>
      <div className="mt-6 space-y-6">
        {rows.length === 0 ? <p className="text-muted-foreground">No lifts from this crew yet.</p> : <><Podium rows={rows.slice(0, 3)} />{rows.length > 3 && <RankList rows={rows.slice(3)} start={3} />}</>}
      </div>
    </PageShell>
  );
}
