import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/app-shell";
import { Podium, RankList } from "@/components/leaderboard-list";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";
import { Users, Trophy, Crown, Swords, Globe2, Flag, UsersRound } from "lucide-react";
import { LiveBattleCard } from "@/components/live-battle-card";
import { toast } from "sonner";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "TOP — REPUNIT" },
      { name: "description", content: "Global strength rankings for lifters and crews." },
      { property: "og:title", content: "TOP — REPUNIT" },
      { property: "og:description", content: "Who is the strongest?" },
    ],
  }),
  component: Boards,
});

type Lift = "total" | "bench" | "squat" | "deadlift";
type Period = "week" | "month" | "all";
type Scope = "global" | "country" | "crew";
type LifterRow = {
  rank_position: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  weight_kg: number;
  reps: number;
  lift_id: string | null;
  lifted_on: string;
  has_video: boolean;
};

type CrewRow = {
  rank_position: number;
  crew_id: string;
  name: string;
  emblem: string | null;
  accent_color: string | null;
  member_count: number;
  score: number;
};
type MoverRow = {
  user_id: string;
  username: string;
  current_rank: number;
  places_gained: number | null;
  is_new: boolean;
};

async function topRpc<T>(name: string, args: Record<string, unknown>) {
  const client = supabase as unknown as {
    rpc: (
      functionName: string,
      parameters: Record<string, unknown>,
    ) => Promise<{
      data: T | null;
      error: { message: string } | null;
    }>;
  };
  return client.rpc(name, args);
}

function Boards() {
  const [tab, setTab] = useState<"lifters" | "crews">("lifters");
  const [lift, setLift] = useState<Lift>("total");
  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState<Scope>("global");
  const { user } = useUser();
  const sentinel = useRef<HTMLDivElement | null>(null);

  const lifters = useInfiniteQuery({
    queryKey: ["top-db-lifters-v2", lift, period, scope, user?.id],
    enabled: tab === "lifters" && (scope === "global" || !!user),
    initialPageParam: null as Record<string, string | number> | null,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await topRpc<LifterRow[]>("get_top_lifters", {
        _lift: lift,
        _period: period,
        _scope: scope,
        _limit: 50,
        _cursor: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as LifterRow[];
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 50) return undefined;
      const last = lastPage.at(-1);
      if (!last) return undefined;
      return {
        weight_kg: last.weight_kg,
        reps: last.reps,
        lifted_on: last.lifted_on,
        user_id: last.user_id,
      };
    },
  });

  const rows = useMemo(() => lifters.data?.pages.flat() ?? [], [lifters.data]);
  const crewQuery = useQuery({
    queryKey: ["top-db-crews-v2", lift, period, user?.id],
    enabled: tab === "crews" && !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data, error }, { data: memberships, error: membershipError }] = await Promise.all([
        topRpc<CrewRow[]>("get_top_crews", { _lift: lift, _period: period, _limit: 100 }),
        supabase.from("crew_members").select("crew_id").eq("user_id", user!.id),
      ]);
      if (error) throw error;
      if (membershipError) throw membershipError;
      const mine = new Set((memberships ?? []).map((item) => item.crew_id));
      return ((data ?? []) as CrewRow[]).map((row) => ({ ...row, is_mine: mine.has(row.crew_id) }));
    },
  });
  const crewRows = crewQuery.data ?? [];
  const ownCrew = crewRows.find((row) => row.is_mine);
  const myRankQuery = useQuery({
    queryKey: ["top-my-rank-v2", lift, period, scope, user?.id],
    enabled: tab === "lifters" && !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await topRpc<{
        rank: number | null;
        value: number | null;
        gap_kg: number | null;
      }>("get_my_rank", {
        _lift: lift,
        _period: period,
        _scope: scope,
      });
      if (error) throw error;
      return data as { rank: number | null; value: number | null; gap_kg: number | null };
    },
  });
  const queryClient = useQueryClient();
  const privacyQuery = useQuery({
    queryKey: ["top-privacy", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as unknown as { top_opt_out?: boolean } | null)?.top_opt_out);
    },
  });
  const changeTopPrivacy = async (hidden: boolean) => {
    const { error } = await topRpc<null>("set_top_opt_out", { _opt_out: hidden });
    if (error) {
      toast.error("Could not update TOP privacy");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["top-privacy", user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["top-db-lifters-v2"] });
    await queryClient.invalidateQueries({ queryKey: ["top-my-rank-v2"] });
    toast.success(hidden ? "Hidden from public TOP" : "Visible on public TOP");
  };
  const moversQuery = useQuery({
    queryKey: ["top-rank-movers-v2", lift],
    enabled: tab === "lifters" && scope === "global",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await topRpc<MoverRow[]>("get_rank_movers", {
        _lift: lift,
        _limit: 5,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const shareRank = async () => {
    const rank = myRankQuery.data?.rank;
    if (!rank) return;
    const label = lift === "total" ? "Total" : lift.charAt(0).toUpperCase() + lift.slice(1);
    const message = `I'm #${rank} on REPUNIT TOP for ${label} (${period === "all" ? "All time" : period}). Can you beat me?`;
    try {
      if (navigator.share)
        await navigator.share({
          title: "My REPUNIT rank",
          text: message,
          url: window.location.origin,
        });
      else {
        await navigator.clipboard.writeText(`${message} ${window.location.origin}`);
        toast.success("Rank copied to clipboard");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError")
        toast.error("Could not share your rank");
    }
  };

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = lifters;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchingNextPage || tab !== "lifters") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, tab]);

  const chip = (active: boolean) =>
    cn(
      "min-h-11 shrink-0 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
    );
  const tabs = (value: "lifters" | "crews", label: string, Icon: typeof Trophy) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={cn(
        "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-black uppercase tracking-wide transition",
        tab === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
  const skeleton = (
    <div className="space-y-3" aria-label="Loading TOP">
      {[0, 1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
          </div>
          <div className="h-6 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );

  return (
    <PageShell>
      <div className="mb-3">
        <LiveBattleCard compact />
      </div>
      <Link
        to="/battles"
        className="mb-5 flex min-h-12 items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-black uppercase tracking-wide text-foreground transition hover:border-primary/50 hover:bg-elevated"
      >
        <span className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-primary" />
          BATTLES{" "}
          <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground">
            Live competition
          </span>
        </span>
        <span className="text-primary">→</span>
      </Link>
      <p className="eyebrow">REPUNIT GLOBAL STRENGTH</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-stat mt-1 text-5xl uppercase sm:text-6xl">
          TOP<span className="text-primary">.</span>
        </h1>
        <Button asChild variant="hero" className="min-h-11">
          <Link to={tab === "crews" ? "/crews/new" : "/records/new"}>
            {tab === "crews" ? "Create crew" : "Log a lift"}
          </Link>
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        {tabs("lifters", "Lifters", Trophy)}
        {tabs("crews", "Crews", Users)}
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {(["total", "bench", "squat", "deadlift"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={lift === value}
            onClick={() => setLift(value)}
            className={chip(lift === value)}
          >
            {value === "total" ? "Total" : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ["week", "Week"],
            ["month", "Month"],
            ["all", "All time"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
            className={chip(period === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "lifters" && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["global", "Global", Globe2],
              ["country", "Country", Flag],
              ["crew", "My crews", UsersRound],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              disabled={value !== "global" && !user}
              className={cn(
                chip(scope === value),
                "flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "lifters" && user && (
        <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span>
            <span className="block text-xs font-bold">Hide me from public TOP</span>
            <span className="block text-[10px] text-muted-foreground">
              Your lifts stay saved and visible inside your Crews.
            </span>
          </span>
          <input
            type="checkbox"
            checked={privacyQuery.data ?? false}
            disabled={privacyQuery.isLoading || privacyQuery.isError}
            onChange={(event) => void changeTopPrivacy(event.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
      )}
      {tab === "lifters" && user && myRankQuery.data?.rank && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-primary/35 bg-primary/[0.08] p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              Your position
            </p>
            <p className="font-stat mt-1 text-4xl">#{myRankQuery.data.rank}</p>
            {myRankQuery.data.gap_kg !== null && (
              <p className="text-xs text-muted-foreground">
                {myRankQuery.data.gap_kg} kg to the next rank
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="hero"
            className="min-h-11"
            onClick={() => void shareRank()}
          >
            Share rank
          </Button>
        </div>
      )}
      {tab === "lifters" && scope === "global" && (moversQuery.data?.length ?? 0) > 0 && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest">Rising lifters</h2>
            <span className="text-[10px] text-muted-foreground">Since last week</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {(moversQuery.data ?? []).map((mover) => (
              <Link
                key={mover.user_id}
                to="/u/$username"
                params={{ username: mover.username }}
                className="min-w-28 rounded-xl border border-border bg-background p-3 transition hover:border-primary/50"
              >
                <span className="block truncate text-xs font-bold">@{mover.username}</span>
                <span className="font-stat mt-1 block text-2xl">#{mover.current_rank}</span>
                <span className="text-[10px] font-bold text-primary">
                  {mover.is_new
                    ? "NEW TO TOP"
                    : mover.places_gained !== null && mover.places_gained > 0
                      ? `↑ ${mover.places_gained}`
                      : "HOLDING"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {tab === "crews"
          ? "Crew score is the combined best verified lifts of its five strongest members."
          : lift === "total"
            ? "Total requires a verified Bench, Squat and Deadlift. Highest combined weight ranks first."
            : "Only verified personal records count. Highest weight ranks first; reps break ties."}
      </p>

      {tab === "lifters" ? (
        <div className="mt-6 space-y-5">
          {!user && scope !== "global" ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-semibold">Sign in to use this ranking scope.</p>
              <Button asChild variant="hero" className="mt-4">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          ) : lifters.isLoading && rows.length === 0 ? (
            skeleton
          ) : lifters.isError && rows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-semibold">TOP is temporarily unavailable.</p>
              <Button variant="line" className="mt-4" onClick={() => void lifters.refetch()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-bold">No verified results yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Be the first to put a lift on TOP.
              </p>
              <Button asChild variant="hero" className="mt-4">
                <Link to="/records/new">Log your first lift</Link>
              </Button>
            </div>
          ) : (
            <>
              <Podium
                rows={rows.slice(0, 3) as unknown as ComponentProps<typeof Podium>["rows"]}
                {...(user ? { currentUserId: user.id } : {})}
              />
              {rows.length > 3 && (
                <RankList
                  rows={rows.slice(3) as unknown as ComponentProps<typeof RankList>["rows"]}
                  start={3}
                  {...(user ? { currentUserId: user.id } : {})}
                />
              )}
              <div ref={sentinel} className="h-2" />
              {lifters.isFetchingNextPage && skeleton}
              {lifters.hasNextPage && !lifters.isFetchingNextPage && (
                <button
                  type="button"
                  onClick={() => void lifters.fetchNextPage()}
                  className="min-h-11 w-full rounded-xl border border-border bg-card text-xs font-bold uppercase tracking-wide text-muted-foreground hover:border-primary/50"
                >
                  Load more
                </button>
              )}
              {!lifters.hasNextPage && rows.length > 0 && (
                <p className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  End of TOP
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {!user ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-semibold">Sign in to view Crew rankings.</p>
              <Button asChild variant="hero" className="mt-4">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          ) : crewQuery.isLoading ? (
            skeleton
          ) : crewQuery.isError ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-semibold">Crew rankings are temporarily unavailable.</p>
              <Button variant="line" className="mt-4" onClick={() => void crewQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : crewRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-bold">No Crew results yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create or join a Crew to compete.
              </p>
              <Button asChild variant="hero" className="mt-4">
                <Link to="/crews">Explore Crews</Link>
              </Button>
            </div>
          ) : (
            <>
              {ownCrew && (
                <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
                  <span className="text-xs font-black uppercase tracking-widest text-primary">
                    Your Crew · #{ownCrew.rank_position}
                  </span>
                  <Crown className="h-4 w-4 text-primary" />
                </div>
              )}
              {crewRows.length >= 3 && (
                <div className="grid grid-cols-3 items-end gap-2">
                  {[crewRows[1], crewRows[0], crewRows[2]].map((crew, index) => {
                    if (!crew) return null;
                    const place = index === 1 ? 1 : index === 0 ? 2 : 3;
                    return (
                      <Link
                        key={crew.crew_id}
                        to="/crews/$id"
                        params={{ id: crew.crew_id }}
                        className={cn(
                          "flex min-w-0 flex-col items-center rounded-xl border border-border bg-card p-3 text-center transition hover:-translate-y-1 hover:border-primary/50",
                          place === 1 && "min-h-36 border-primary/40 bg-primary/[0.08]",
                        )}
                      >
                        <span className="font-stat text-2xl">
                          {place === 1 ? (
                            <Crown className="mx-auto h-5 w-5 text-primary" />
                          ) : (
                            `#${place}`
                          )}
                        </span>
                        <span
                          className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-xl"
                          style={{ borderColor: crew.accent_color ?? undefined }}
                        >
                          {crew.emblem || "🏋️"}
                        </span>
                        <b className="mt-2 w-full truncate text-[10px] font-black uppercase">
                          {crew.name}
                        </b>
                        <span className="font-stat mt-1 text-lg">
                          {Math.round(Number(crew.score)).toLocaleString()}
                        </span>
                        <span className="text-[9px] uppercase text-muted-foreground">kg total</span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {crewRows.map((crew) => (
                  <Link
                    key={crew.crew_id}
                    to="/crews/$id"
                    params={{ id: crew.crew_id }}
                    className={cn(
                      "grid grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3.5 transition last:border-0 hover:bg-elevated",
                      crew.is_mine && "bg-primary/[0.08]",
                    )}
                  >
                    <span
                      className={cn(
                        "font-stat text-xl",
                        crew.is_mine ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {crew.rank_position}
                    </span>
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-xl"
                      style={{ borderColor: crew.accent_color ?? undefined }}
                    >
                      {crew.emblem || "🏋️"}
                    </span>
                    <span className="min-w-0">
                      <b className="block truncate text-xs font-black uppercase">
                        {crew.name}
                        {crew.is_mine && (
                          <span className="ml-1.5 text-[8px] text-primary">YOU</span>
                        )}
                      </b>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {crew.member_count} members
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="font-stat text-lg tabular-nums">
                        {Math.round(Number(crew.score)).toLocaleString()}
                      </b>
                      <span className="block text-[9px] text-muted-foreground">kg total</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
