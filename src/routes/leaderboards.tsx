import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-shell";
import { useLeaderboard, Podium, RankList } from "@/components/leaderboard-list";
import { EXERCISES, type Exercise } from "@/lib/lifts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "Leaderboards — REPUNIT" }, { name: "description", content: "Global strength rankings for bench, squat, deadlift, press and pull-ups." }, { property: "og:title", content: "Leaderboards — REPUNIT" }, { property: "og:description", content: "Who is the strongest?" }] }),
  component: Boards,
});

function Boards() {
  const [ex, setEx] = useState<Exercise>("bench");
  const [range, setRange] = useState<"all" | "30" | "7">("all");
  const since = range === "all" ? null : new Date(Date.now() - Number(range) * 864e5).toISOString().slice(0, 10);
  const { data: rows = [], isLoading, isError, refetch } = useLeaderboard(ex, null, since);
  const meta = EXERCISES.find((e) => e.id === ex);
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider", on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground");
  return (
    <PageShell>
      <p className="eyebrow">Global</p>
      <h1 className="font-stat mt-2 text-6xl uppercase">Leaderboards</h1>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {EXERCISES.map((e) => <Button key={e.id} variant="ghost" size="sm" className={chip(e.id === ex)} onClick={() => setEx(e.id)}>{e.short}</Button>)}
      </div>
      <div className="mt-2 flex gap-2">
        {([["all", "All time"], ["30", "Monthly"], ["7", "Weekly"]] as const).map(([k, l]) => <Button key={k} variant="ghost" size="sm" className={chip(range === k)} onClick={() => setRange(k)}>{l}</Button>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Standard: {meta?.standard} Ranked by heaviest weight, then reps.</p>
      <div className="mt-8 space-y-6">
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : isError ? <div><p>Could not load the leaderboard.</p><Button variant="line" className="mt-3" onClick={() => refetch()}>Try again</Button></div> : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No lifts yet in this category.</p>
        ) : (<><Podium rows={rows.slice(0, 3)} />{rows.length > 3 && <RankList rows={rows.slice(3)} start={3} />}</>)}
      </div>
    </PageShell>
  );
}
