import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Dumbbell, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";
import type { Exercise } from "@/lib/lifts";
import { AvatarChip } from "./avatar-chip";
import { cn } from "@/lib/utils";
import { LiftVideoDialog } from "@/components/lift-video-dialog";

export function useLeaderboard(
  exercise: Exercise | "total",
  crew?: string | null,
  since?: string | null,
  userIds?: string[] | null,
) {
  const scoped = userIds !== undefined;
  return useQuery({
    queryKey: ["leaderboard", exercise, crew ?? null, since ?? null, scoped, userIds ?? null],
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const exercises: Exercise[] = exercise === "total" ? ["bench", "squat", "deadlift"] : [exercise];
      const results = await Promise.all(exercises.map(async (_exercise) => {
        if (scoped) {
          const { data, error } = await (supabase as any).rpc("leaderboard_scoped", {
            _exercise,
            _crew: crew ?? null,
            _since: since ?? null,
            _user_ids: userIds ?? null,
          });
          if (!error) return data ?? [];
          // The base leaderboard RPC exists in the original schema. Fall back
          // to it if the optional friends-scope migration has not been applied.
          const fallbackArgs: { _exercise: Exercise; _crew?: string; _since?: string } = { _exercise };
          if (crew) fallbackArgs._crew = crew;
          if (since) fallbackArgs._since = since;
          const fallback = await supabase.rpc("leaderboard", fallbackArgs);
          if (fallback.error) throw fallback.error;
          const allowedUsers = new Set(userIds ?? []);
          return (fallback.data ?? []).filter((row) => allowedUsers.has(row.user_id));
        }
        const args: { _exercise: Exercise; _crew?: string; _since?: string } = { _exercise };
        if (crew) args._crew = crew;
        if (since) args._since = since;
        const { data, error } = await supabase.rpc("leaderboard", args);
        if (error) throw error;
        return data ?? [];
      }));
      let rows = results.flat();
      if (exercise === "total") {
        const totals = new Map<string, (typeof rows)[number] & { total: number; lifts_count: number }>();
        for (const row of rows) {
          const current = totals.get(row.user_id);
          if (current) { current.total += Number(row.weight_kg); current.lifts_count += 1; }
          else totals.set(row.user_id, { ...row, total: Number(row.weight_kg), lifts_count: 1 });
        }
        rows = [...totals.values()].sort((a, b) => Number(b.total) - Number(a.total))
          .map((row, index) => ({ ...row, weight_kg: row.total, reps: 1, rank_position: index + 1 }));
      }
      if (!rows.length) return rows.map((row) => ({ ...row, has_video: false }));
      const { data: evidence, error: evidenceError } = await supabase.from("lifts").select("id, video_path").in("id", rows.map((row) => row.lift_id));
      if (evidenceError) return rows.map((row) => ({ ...row, has_video: false }));
      const videoIds = new Set((evidence ?? []).filter((lift) => Boolean(lift.video_path)).map((lift) => lift.id));
      return rows.map((row) => ({ ...row, has_video: videoIds.has(row.lift_id) }));
    },
  });
}

type Row = NonNullable<ReturnType<typeof useLeaderboard>["data"]>[number] & { rank_position?: number };
const PODIUM = ["text-gold", "text-silver", "text-bronze"];

export function Podium({ rows, currentUserId }: { rows: Row[]; currentUserId?: string }) {
  const { user } = useUser();
  const order = [rows[1], rows[0], rows[2]];
  const [activeLiftId, setActiveLiftId] = useState<string | null>(null);
  return <>
  <div className="grid grid-cols-3 items-end gap-2 md:gap-4">
    {order.map((r, i) => {
      if (!r) return <div key={i} />;
      const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
      return <div key={r.user_id} className={cn("rise flex min-w-0 flex-col items-center rounded-xl border border-border bg-card p-3 text-center transition hover:border-foreground/30", rank === 1 && "border-primary/50 bg-gradient-to-b from-primary/15 to-card pb-5 shadow-glow", currentUserId === r.user_id && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        {rank === 1 && <Crown className="mb-1 h-5 w-5 text-gold" />}
        <Link to="/u/$username" params={{ username: r.username }} className="flex w-full flex-col items-center">
          <AvatarChip name={r.username} url={r.avatar_url} className={rank === 1 ? "h-14 w-14" : "h-11 w-11"} />
          <p className="mt-2 w-full truncate text-xs font-semibold">@{r.username}{currentUserId === r.user_id && <span className="ml-1 text-[9px] font-black uppercase text-primary">You</span>}</p>
          <p className={cn("font-stat mt-1", rank === 1 ? "text-5xl" : "text-3xl")}>{Number(r.weight_kg)}<span className="text-base text-muted-foreground">kg</span></p>
          {r.reps > 1 && <p className="text-[10px] text-muted-foreground">× {r.reps} reps</p>}{r.has_video && <span className="mt-1 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Video</span>}
          <p className={cn("font-stat mt-2 text-2xl", PODIUM[rank - 1])}>#{rank}</p>
        </Link>
        <Link to="/u/$username" params={{ username: r.username }} hash="training-split" className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg border border-border bg-elevated/60 px-2 text-[10px] font-bold uppercase tracking-wide text-foreground transition hover:border-primary/40 hover:text-primary">
          <Dumbbell className="h-3 w-3" /> View SPLIT
        </Link>
        {r.has_video ? <>
          {user
            ? <button type="button" onClick={() => setActiveLiftId(r.lift_id)} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-foreground transition hover:bg-primary/20 sm:text-xs"><Camera className="h-3.5 w-3.5"/> Watch video</button>
            : <Link to="/auth" className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated/60 px-2 text-[10px] font-bold uppercase tracking-wide text-foreground transition hover:border-primary/40 sm:text-xs">Sign in to watch</Link>}
          <Link to="/records/$id" params={{ id: r.lift_id }} className="mt-1 inline-flex min-h-7 w-full items-center justify-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-primary">View result · Flag</Link>
        </> : <Link to="/records/$id" params={{ id: r.lift_id }} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated/60 px-2 text-[10px] font-bold uppercase tracking-wide text-foreground transition hover:border-primary/40 sm:text-xs">View result · Flag</Link>}
      </div>;
    })}
  </div>
  <LiftVideoDialog liftId={activeLiftId} open={!!activeLiftId} onOpenChange={(open) => { if (!open) setActiveLiftId(null); }} />
  </>;
}

export function RankList({ rows, start = 0, currentUserId }: { rows: Row[]; start?: number; currentUserId?: string }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activeLiftId, setActiveLiftId] = useState<string | null>(null);
  return <>
  <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
    {rows.map((r, i) => {
      const rank = r.rank_position ?? start + i + 1;
      const prev = i > 0 ? rows[i - 1] : null;
      const adjacent = !prev || r.rank_position == null || prev.rank_position == null || r.rank_position === prev.rank_position + 1;
      const gap = prev && adjacent ? Number(prev.weight_kg) - Number(r.weight_kg) : null;
      return <li key={r.user_id} role="link" tabIndex={0} onClick={()=>navigate({to:"/u/$username",params:{username:r.username}})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();navigate({to:"/u/$username",params:{username:r.username}});}}} className={cn("group flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-elevated active:bg-primary/10", currentUserId === r.user_id && "bg-primary/[0.08] ring-1 ring-inset ring-primary/40") }>
        <span className="font-stat w-8 shrink-0 text-2xl text-muted-foreground">{rank}</span>
        <Link to="/u/$username" params={{username:r.username}} onClick={e=>e.stopPropagation()} aria-label={`Open @${r.username} profile`} className="rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><AvatarChip name={r.username} url={r.avatar_url} className="h-9 w-9" /></Link>
        <div className="min-w-0 flex-1">
          <Link to="/u/$username" params={{ username: r.username }} className="truncate text-sm font-semibold hover:text-primary" onClick={e=>e.stopPropagation()}>@{r.username}{currentUserId === r.user_id && <span className="ml-1 text-[9px] font-black uppercase text-primary">You</span>}</Link>
          <Link to="/u/$username" params={{ username: r.username }} hash="training-split" className="relative z-10 mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:underline" onClick={e=>e.stopPropagation()}><Dumbbell className="h-3 w-3" /> View SPLIT</Link>
        </div>
        <div className="text-right">
          <p className="font-stat text-3xl">{Number(r.weight_kg)}<span className="text-sm text-muted-foreground">kg</span></p>
          <p className="text-[10px] text-muted-foreground">{r.reps > 1 ? `× ${r.reps} · ` : ""}{gap !== null ? `−${gap.toFixed(1)} kg` : rank === 1 ? "leader" : `rank #${rank}`}</p>{r.has_video && <span className="mt-1 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Video</span>}
          {r.has_video && rank <= 10 && (user
            ? <button type="button" onClick={(event) => { event.stopPropagation(); setActiveLiftId(r.lift_id); }} className="relative z-10 mt-1 inline-flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:underline"><Camera className="h-3 w-3"/> Watch video</button>
            : <Link to="/auth" className="relative z-10 mt-1 inline-flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:underline" onClick={e=>e.stopPropagation()}>Sign in to watch</Link>)}
          <Link to="/records/$id" params={{ id: r.lift_id }} className="relative z-10 mt-1 inline-flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-primary" onClick={e=>e.stopPropagation()}>View result · Flag</Link>
        </div>
      </li>;
    })}
  </ol>
  <LiftVideoDialog liftId={activeLiftId} open={!!activeLiftId} onOpenChange={(open) => { if (!open) setActiveLiftId(null); }} />
  </>;
}
