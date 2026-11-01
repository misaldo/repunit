import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Exercise } from "@/lib/lifts";
import { StatusBadge } from "./status-badge";
import { AvatarChip } from "./avatar-chip";
import { cn } from "@/lib/utils";

export function useLeaderboard(exercise: Exercise, crew?: string | null, since?: string | null) {
  return useQuery({
    queryKey: ["leaderboard", exercise, crew ?? null, since ?? null],
    queryFn: async () => {
      const args: { _exercise: Exercise; _crew?: string; _since?: string } = { _exercise: exercise };
      if (crew) args._crew = crew;
      if (since) args._since = since;
      const { data, error } = await supabase.rpc("leaderboard", args);
      if (error) throw error;
      return data ?? [];
    },
  });
}

type Row = NonNullable<ReturnType<typeof useLeaderboard>["data"]>[number];

const PODIUM = ["text-gold", "text-silver", "text-bronze"];

export function Podium({ rows }: { rows: Row[] }) {
  const order = [rows[1], rows[0], rows[2]];
  return (
    <div className="grid grid-cols-3 items-end gap-2 md:gap-4">
      {order.map((r, i) => {
        if (!r) return <div key={i} />;
        const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
        return (
          <Link key={r.user_id} to="/u/$username" params={{ username: r.username }}
            className={cn("rise flex flex-col items-center rounded-xl border border-border bg-card p-3 text-center transition hover:border-foreground/30",
              rank === 1 && "border-primary/50 bg-gradient-to-b from-primary/15 to-card pb-8 shadow-glow")}>
            {rank === 1 && <Crown className="mb-1 h-5 w-5 text-gold" />}
            <AvatarChip name={r.username} url={r.avatar_url} className={rank === 1 ? "h-14 w-14" : "h-11 w-11"} />
            <p className="mt-2 w-full truncate text-xs font-semibold">@{r.username}</p>
            <p className={cn("font-stat mt-1", rank === 1 ? "text-5xl" : "text-3xl")}>{Number(r.weight_kg)}<span className="text-base text-muted-foreground">kg</span></p>
            {r.reps > 1 && <p className="text-[10px] text-muted-foreground">× {r.reps} reps</p>}
            <p className={cn("font-stat mt-2 text-2xl", PODIUM[rank - 1])}>#{rank}</p>
          </Link>
        );
      })}
    </div>
  );
}

export function RankList({ rows, start = 0 }: { rows: Row[]; start?: number }) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {rows.map((r, i) => {
        const rank = start + i + 1;
        const prev = i > 0 ? rows[i - 1] : start > 0 ? null : null;
        const gap = prev ? Number(prev.weight_kg) - Number(r.weight_kg) : null;
        return (
          <li key={r.user_id}>
            <Link to="/records/$id" params={{ id: r.lift_id }} className="flex items-center gap-3 px-4 py-3 hover:bg-elevated">
              <span className="font-stat w-8 text-2xl text-muted-foreground">{rank}</span>
              <AvatarChip name={r.username} url={r.avatar_url} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">@{r.username}</p>
                <StatusBadge status={r.status} className="mt-0.5" />
              </div>
              <div className="text-right">
                <p className="font-stat text-3xl">{Number(r.weight_kg)}<span className="text-sm text-muted-foreground">kg</span></p>
                <p className="text-[10px] text-muted-foreground">
                  {r.reps > 1 ? `× ${r.reps} · ` : ""}{gap !== null ? `−${gap.toFixed(1)} kg` : "leader"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
