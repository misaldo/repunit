// @ts-nocheck -- references planned backend features not yet set up
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Flame, Medal, Users, ArrowUpRight, Zap, Trophy } from "lucide-react";
import { getPrGoalProgress } from "@/lib/pr-goal";
import { supabase } from "@/integrations/supabase/client";
import { FunStatsCard } from "@/components/fun-stats";
import { ThroneBanner } from "@/components/throne-banner";
import { ProgressionCard } from "@/components/progression-card";

type Props = { userId: string };

type LiftRow = { id: string; user_id: string; exercise: string; weight_kg: number; reps: number; lifted_on: string; created_at: string; video_path: string | null };
type ProfileRow = { id: string; username: string; display_name: string | null; avatar_url: string | null };

const labels: Record<string, string> = { bench: "BENCH", squat: "SQUAT", deadlift: "DEADLIFT", ohp: "OHP", pullup: "PULL-UP" };
const since = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

export function HomeEngagement({ userId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["home-engagement", userId],
    staleTime: 30000,
    refetchInterval: 60000,
    queryFn: async () => {
      const [{ data: memberships, error: membershipError }, { data: friendships, error: friendError }, { data: mine, error: mineError }, { data: progress, error: progressError }, { data: bestPr, error: bestPrError }, { count: prEventsCount, error: prEventsError }, { data: userAchievements, error: userAchievementsError }, { data: prGoalRow, error: prGoalError }] = await Promise.all([
        supabase.from("crew_members").select("crew_id").eq("user_id", userId),
        supabase.from("friend_requests").select("requester_id,recipient_id").eq("status", "accepted").or(`requester_id.eq.${userId},recipient_id.eq.${userId}`),
        supabase.from("lifts").select("id,user_id,exercise,weight_kg,reps,lifted_on,created_at,video_path").eq("user_id", userId).eq("status", "VERIFIED").gte("created_at", since(365)).order("created_at", { ascending: false }).limit(1000),
        supabase.from("user_progress").select("xp,current_streak,longest_streak").eq("user_id", userId).maybeSingle(),
        supabase.from("lifts").select("exercise,weight_kg").eq("user_id", userId).eq("status", "VERIFIED").in("exercise", ["bench", "squat", "deadlift"]),
        supabase.from("user_pr_events").select("lift_id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("user_achievements").select("achievement_key").eq("user_id", userId),
        supabase.from("user_pr_goals").select("baseline_pr_count").eq("user_id", userId).maybeSingle(),
      ]);
      if (membershipError) throw membershipError;
      if (friendError) throw friendError;
      if (mineError) throw mineError;
      if (progressError) throw progressError;
      if (bestPrError) throw bestPrError;
      if (prEventsError) throw prEventsError;
      if (userAchievementsError) throw userAchievementsError;
      if (prGoalError) throw prGoalError;
      const crewIds = [...new Set((memberships ?? []).map((m) => m.crew_id))];
      const friendIds = [...new Set((friendships ?? []).map((f) => f.requester_id === userId ? f.recipient_id : f.requester_id))];
      const [crewMembersResult, friendLiftsResult] = await Promise.all([
        crewIds.length ? supabase.from("crew_members").select("crew_id,user_id").in("crew_id", crewIds) : Promise.resolve({ data: [], error: null }),
        friendIds.length ? supabase.from("lifts").select("id,user_id,exercise,weight_kg,reps,lifted_on,created_at,video_path").in("user_id", friendIds).eq("status", "VERIFIED").gte("created_at", since(14)).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [], error: null }),
      ]);
      if (crewMembersResult.error) throw crewMembersResult.error;
      if (friendLiftsResult.error) throw friendLiftsResult.error;
      const crewMembers = crewMembersResult.data ?? [];
      const crewMemberIds = [...new Set(crewMembers.map((m) => m.user_id))];
      const allIds = [...new Set([...crewMemberIds, ...friendIds])];
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
      const [{ data: profiles, error: profilesError }, { data: crewLifts, error: crewLiftsError }, { data: crewRows, error: crewError }, { data: monthLifts, error: monthLiftsError }] = await Promise.all([
        allIds.length ? supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", allIds) : Promise.resolve({ data: [], error: null }),
        crewMemberIds.length ? supabase.from("lifts").select("id,user_id,exercise,weight_kg,reps,lifted_on,created_at,video_path").in("user_id", crewMemberIds).eq("status", "VERIFIED").order("weight_kg", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
        crewIds.length ? supabase.from("crews").select("id,name,emblem").in("id", crewIds) : Promise.resolve({ data: [], error: null }),
        crewMemberIds.length ? supabase.from("lifts").select("user_id,weight_kg,reps,created_at").in("user_id", crewMemberIds).eq("status", "VERIFIED").gte("created_at", monthStart.toISOString()).limit(5000) : Promise.resolve({ data: [], error: null }),
      ]);
      if (profilesError) throw profilesError;
      if (crewLiftsError) throw crewLiftsError;
      if (crewError) throw crewError;
      if (monthLiftsError) throw monthLiftsError;
      const profileMap = new Map<string, ProfileRow>((profiles ?? []).map((p) => [p.id, p as ProfileRow] as const));
      const crewMap = new Map((crewRows ?? []).map((c) => [c.id, c] as const));
      const primaryCrewId = crewIds[0];
      const primaryCrew = primaryCrewId ? crewMap.get(primaryCrewId) : null;
      const membersOfPrimary = crewMembers.filter((m) => m.crew_id === primaryCrewId).map((m) => m.user_id);
      const crewLiftRows = (crewLifts ?? []) as LiftRow[];
      const bestByUserExercise = new Map<string, LiftRow>();
      for (const lift of crewLiftRows) {
        const key = lift.user_id + ":" + lift.exercise;
        const old = bestByUserExercise.get(key);
        if (!old || Number(lift.weight_kg) > Number(old.weight_kg) || (Number(lift.weight_kg) === Number(old.weight_kg) && Number(lift.reps) > Number(old.reps))) bestByUserExercise.set(key, lift);
      }
      const rivalries: { exercise: string; rival: ProfileRow; gap: number; rivalWeight: number; myWeight: number }[] = [];
      for (const exercise of ["bench", "squat", "deadlift", "ohp"]) {
        const myBest = bestByUserExercise.get(userId + ":" + exercise);
        const myWeight = Number(myBest?.weight_kg ?? 0);
        const rivals = membersOfPrimary.filter((id) => id !== userId).map((id) => ({ id, lift: bestByUserExercise.get(id + ":" + exercise) })).filter((x) => x.lift && Number(x.lift.weight_kg) > myWeight).sort((a, b) => Number(a.lift!.weight_kg) - Number(b.lift!.weight_kg));
        const nearest = rivals[0];
        const rival = nearest ? profileMap.get(nearest.id) : null;
        if (nearest?.lift && rival) rivalries.push({ exercise, rival, gap: Number(nearest.lift.weight_kg) - myWeight, rivalWeight: Number(nearest.lift.weight_kg), myWeight });
      }
      const crewTop = membersOfPrimary.map((id) => {
        const scores = ["bench", "squat", "deadlift"].map((exercise) => Number(bestByUserExercise.get(id + ":" + exercise)?.weight_kg ?? 0));
        return { id, score: scores.reduce((a, b) => a + b, 0), profile: profileMap.get(id) };
      }).filter((m) => m.profile).sort((a, b) => b.score - a.score).slice(0, 3);
      const primaryMemberIds = new Set(crewMembers.filter((m) => m.crew_id === primaryCrewId).map((m) => m.user_id));
      const monthVolume = (monthLifts ?? []).filter((l) => primaryMemberIds.has(l.user_id)).reduce((sum, l) => sum + Number(l.weight_kg) * Math.max(1, Number(l.reps ?? 1)), 0);
      const weeklyDates = new Set(((mine ?? []) as LiftRow[]).map((l) => {
        const d = new Date(l.created_at); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); d.setUTCHours(0, 0, 0, 0); return d.toISOString().slice(0, 10);
      }));
      let trainingWeeks = 0;
      const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      for (let i = 0; i < 52; i++) { const d = new Date(monday); d.setUTCDate(d.getUTCDate() - i * 7); if (weeklyDates.has(d.toISOString().slice(0, 10))) trainingWeeks++; else break; }
      const friendLifts = ((friendLiftsResult.data ?? []) as LiftRow[]).map((lift) => ({ ...lift, profile: profileMap.get(lift.user_id) })).filter((lift) => lift.profile);
      let badges: string[] = [];
      if (crewIds.length) {
        const { data: badgeRows, error: badgeError } = await supabase.from("crew_achievements").select("crew_id,achievement_key").in("crew_id", crewIds);
        if (badgeError) throw badgeError;
        badges = (badgeRows ?? []).map((b) => b.achievement_key);
      }
      const bestPrs = { bench: 0, squat: 0, deadlift: 0 };
      for (const lift of bestPr ?? []) {
        if (lift.exercise in bestPrs) bestPrs[lift.exercise] = Math.max(bestPrs[lift.exercise], Number(lift.weight_kg) || 0);
      }
      return { primaryCrew, rivalries: rivalries.slice(0, 3), crewTop, friendLifts, monthVolume, trainingWeeks, badges, progress, bestPrs, prCount: Number(prEventsCount ?? 0), prBaseline: Number(prGoalRow?.baseline_pr_count ?? prEventsCount ?? 0), achievements: (userAchievements ?? []).map((row) => row.achievement_key) };
    },
  });

  if (isLoading) return <><div className="mt-6 h-40 animate-pulse rounded-2xl bg-card" /><ThroneBanner /></>;
  if (isError || !data) return <ThroneBanner />;
  const badgeLabels: Record<string, string> = { weekly_winners: "🏆 Weekly Winners", "100_ton_club": "💯 100 Ton Club", iron_squad: "🛡️ Iron Squad" };
  const prGoal = getPrGoalProgress(data.prCount, data.prBaseline);
  return <div className="mt-6 space-y-6">
    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">YOUR NEXT TARGET</p><h2 className="font-stat mt-1 text-2xl uppercase">Rivalry</h2></div><Zap className="h-5 w-5 text-primary"/></div>
      {data.rivalries.length ? <div className="grid gap-3 sm:grid-cols-3">{data.rivalries.map((r) => <Link key={r.exercise} to="/leaderboards" className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[.10] to-card p-4 transition hover:border-primary/60"><p className="text-[9px] font-black uppercase tracking-[.18em] text-primary">{labels[r.exercise]} · TARGET LOCKED</p><p className="mt-2 font-stat text-3xl">{r.gap.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg</p><p className="mt-1 text-xs text-muted-foreground">You're behind <b className="text-foreground">{r.rival.display_name || r.rival.username}</b> in {data.primaryCrew?.name ?? "your Crew"}.</p><p className="mt-2 text-[10px] font-bold uppercase text-muted-foreground">Their best {r.rivalWeight} kg · Yours {r.myWeight} kg</p></Link>)}</div> : <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{data.primaryCrew ? "Set a Crew record and your closest rival will appear here." : "Join a Crew to unlock personal rivalries."}</div>}
    </section>
    <ThroneBanner />
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[.12] via-card to-card p-4 sm:p-5">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Trophy className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">PERSONAL RECORD MILESTONE</p><h2 className="mt-1 font-stat text-xl uppercase">{prGoal.complete ? "PR Duo unlocked" : "Two PRs. One badge."}</h2><p className="mt-1 text-xs text-muted-foreground">{prGoal.complete ? "You have broken your verified personal record at least twice. Keep pushing." : "Set two new verified personal records to unlock the PR Duo achievement."}</p></div><p className="font-stat text-2xl tabular-nums">{prGoal.count}<span className="text-sm text-muted-foreground">/2</span></p></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/80" role="progressbar" aria-valuenow={prGoal.count} aria-valuemin={0} aria-valuemax={prGoal.target} aria-label="Verified personal record goal progress"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${prGoal.count / prGoal.target * 100}%` }}/></div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{prGoal.complete ? "Achievement added to your collection" : `${prGoal.remaining} more verified ${prGoal.remaining === 1 ? "PR" : "PRs"} to go`}</p>
    </section>
    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">CREW POWER</p><h2 className="font-stat mt-1 text-2xl uppercase">Crew TOP</h2></div><Link to="/leaderboards" className="text-xs font-bold text-primary">Full rankings <ArrowUpRight className="inline h-3 w-3"/></Link></div>
      {data.primaryCrew ? <div className="rounded-2xl border border-border bg-card p-4"><p className="mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{data.primaryCrew.emblem || "🏋️"} {data.primaryCrew.name} · BIG THREE TOTAL</p>{data.crewTop.map((m, i) => <div key={m.id} className="flex items-center gap-3 border-t border-border/70 py-3 first:border-0"><span className="font-stat text-xl text-primary">0{i + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{m.profile?.display_name || m.profile?.username}</p><p className="text-[10px] text-muted-foreground">@{m.profile?.username}</p></div><p className="font-stat text-xl tabular-nums">{m.score.toLocaleString()} <span className="text-[10px] text-muted-foreground">kg</span></p></div>)}{data.badges.length > 0 && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{[...new Set(data.badges)].map((b) => <span key={b} className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-primary">{badgeLabels[b] || b.replace(/_/g, " ")}</span>)}</div>}</div> : <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Your Crew TOP appears when you join a Crew.</p>}
      {data.primaryCrew && data.monthVolume > 0 && <div className="mt-3"><FunStatsCard kg={data.monthVolume} headline="THIS MONTH · CREW POWER" prefix={data.primaryCrew.name + " lifted"}/></div>}
    </section>
    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">YOUR PEOPLE</p><h2 className="font-stat mt-1 text-2xl uppercase">Friends' activity</h2></div><Users className="h-5 w-5 text-primary"/></div>
      {data.friendLifts.length ? <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4">{data.friendLifts.slice(0, 5).map((lift) => <Link key={lift.id} to="/records/$id" params={{ id: lift.id }} className="flex items-center gap-3 py-3 transition hover:text-primary"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{(lift.profile?.username ?? "R").slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{lift.profile?.display_name || lift.profile?.username} logged {labels[lift.exercise] || lift.exercise}</span><span className="text-[10px] text-muted-foreground">{Number(lift.weight_kg).toLocaleString()} kg × {lift.reps} · {new Date(lift.created_at).toLocaleDateString()}</span></span>{lift.video_path && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[9px] font-black uppercase text-primary">Video</span>}<ArrowUpRight className="h-4 w-4 text-muted-foreground"/></Link>)}</div> : <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Your friends' verified lifts will show up here. <Link to="/people" className="font-bold text-primary">Find lifters</Link>.</div>}
    </section>
    <section>
      <ProgressionCard xp={Number(data.progress?.xp ?? 0)} streak={Number(data.progress?.current_streak ?? 0)} longestStreak={Number(data.progress?.longest_streak ?? 0)} bestPrs={data.bestPrs} achievements={data.achievements} compact />
    </section>
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2"><Flame className="h-5 w-5 text-primary"/><p className="text-[10px] font-black uppercase tracking-widest text-primary">Training-week streak</p></div><p className="mt-2 font-stat text-4xl">{data.trainingWeeks} <span className="text-base text-muted-foreground">weeks</span></p><p className="mt-1 text-xs text-muted-foreground">Consecutive weeks with at least one verified lift.</p></div>
      <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2"><Medal className="h-5 w-5 text-primary"/><p className="text-[10px] font-black uppercase tracking-widest text-primary">Crew collection</p></div><p className="mt-2 font-stat text-4xl">{new Set(data.badges).size} <span className="text-base text-muted-foreground">badges</span></p><p className="mt-1 text-xs text-muted-foreground">{data.badges.length ? "Your Crew is building its legacy." : "Weekly Winners and 100 Ton Club badges unlock through Crew achievements."}</p></div>
    </section>
  </div>;
}
