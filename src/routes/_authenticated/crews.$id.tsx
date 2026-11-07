// @ts-nocheck -- references backend features not yet set up; typed once their tables exist
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LogOut, Users, ShieldCheck, RefreshCw, UserMinus, Crown, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLeaderboard, Podium, RankList } from "@/components/leaderboard-list";
import { EXERCISES, type Exercise } from "@/lib/lifts";
import { AvatarChip } from "@/components/avatar-chip";
import { getLevel } from "@/lib/progression";
import { Zap, Medal, Swords } from "lucide-react";
import { CrewBattles } from "@/components/crew-battles";
import { FunStatsCard } from "@/components/fun-stats";

export const Route = createFileRoute("/_authenticated/crews/$id")({
  head: () => ({ meta: [{ property: "og:title", content: "Crew — REPUNIT" }, { property: "og:description", content: "Crew leaderboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Crew — REPUNIT" }, { name: "description", content: "Crew leaderboard." }] }),
  component: Crew,
});

function Crew() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const [ex, setEx] = useState<Exercise>("bench");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crew", id],
    queryFn: async () => {
      const { data: c, error } = await (supabase as any).from("crews").select("id, name, description, owner_id, max_members, is_public").eq("id", id).maybeSingle();
      if (error) throw error;
      // Keep the core crew page independent from optional invite/profile relations.
      let code: string | null = null;
      if (c) {
        const { data: inviteCode } = await (supabase as any).rpc("crew_invite_code", { _crew: id });
        code = inviteCode ?? null;
      }
      const { data: memberRows, error: membersError } = await (supabase as any)
        .from("crew_members").select("user_id, role").eq("crew_id", id);
      if (membersError) throw membersError;
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id);
      let profiles: any[] = [];
      if (memberIds.length) {
        const { data: profileRows, error: profileRowsError } = await (supabase as any)
          .from("profiles").select("id, username, display_name, avatar_url").in("id", memberIds);
        if (profileRowsError) throw profileRowsError;
        profiles = profileRows ?? [];
      }
      const profileById = new Map(profiles.map((p: any) => [p.id, p]));
      const members = (memberRows ?? []).map((m: any) => ({ ...m, profiles: profileById.get(m.user_id) ?? null }));
      const { data: rankingRows, error: rankingError } = await (supabase as any).rpc("crew_leaderboard", {
        _exercise: "total", _from: null, _to: null,
      });
      let crewScore = !rankingError ? (rankingRows ?? []).find((row: any) => row.id === id) ?? null : null;
      if (rankingError && (rankingError.code === "42883" || rankingError.code === "PGRST202")) {
        const safeIds = memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"];
        const [{ data: lifts, error: liftsError }, { data: wins, error: winsError }] = await Promise.all([
          (supabase as any).from("lifts").select("weight_kg,reps").in("user_id", safeIds).eq("status", "VERIFIED"),
          (supabase as any).from("crew_battles").select("id").eq("winner_crew_id", id).eq("status", "completed").eq("is_weekly", true),
        ]);
        if (liftsError) throw liftsError;
        if (winsError) throw winsError;
        crewScore = {
          total: (lifts ?? []).reduce((sum: number, lift: any) => sum + Number(lift.weight_kg) * Number(lift.reps ?? 1), 0),
          wins: wins?.length ?? 0,
        };
      } else if (rankingError) {
        throw rankingError;
      }
      return { c, code, members, crewScore };
    },
  });
  const { data: rows = [], isLoading: ranksLoading, isError: ranksError, refetch: refetchRanks } = useLeaderboard(ex, id);
  const [saving, setSaving] = useState(false);
  const [challengeCrew, setChallengeCrew] = useState("");
  const [challengeCategory, setChallengeCategory] = useState<"bench"|"squat"|"deadlift"|"volume">("bench");
  const [challenging, setChallenging] = useState(false);
  const { data: myAdminCrews = [] } = useQuery({
    queryKey: ["my-admin-crews", user.id],
    queryFn: async () => {
      const { data: memberships, error } = await (supabase as any).from("crew_members")
        .select("crew_id").eq("user_id", user.id).eq("role", "admin");
      if (error) throw error;
      const ids = (memberships ?? []).map((m: any) => m.crew_id).filter((crewId: string) => crewId !== id);
      if (!ids.length) return [];
      const { data: crews, error: crewsError } = await (supabase as any).from("crews").select("id,name").in("id", ids);
      if (crewsError) throw crewsError;
      return crews ?? [];
    },
  });
  const isMember = data?.members?.some((m: any) => m.user_id === user.id) ?? false;
  const isAdmin = data?.members?.some((m: any) => m.user_id === user.id && m.role === "admin") ?? false;
  const count = data?.members?.length ?? 0;
  const cap = Number(data?.c?.max_members ?? 20);
  const crewLevel = getLevel(Number((data?.c as any)?.total_xp ?? 0));
  async function joinPublicCrew() { setSaving(true); try { const { error } = await (supabase as any).rpc("join_public_crew", { _crew: id }); if (error) throw error; toast.success("You joined the crew"); await refreshCrew(); } catch { toast.error("Could not join this crew. Please try again."); } finally { setSaving(false); } }
  async function toggleVisibility() { setSaving(true); try { const { error } = await (supabase as any).rpc("set_crew_visibility", { _crew: id, _public: !data?.c?.is_public }); if (error) throw error; toast.success(data?.c?.is_public ? "Crew is now private" : "Crew is now public"); await refreshCrew(); } catch { toast.error("Could not update crew visibility. Please try again."); } finally { setSaving(false); } }
  async function sendCrewChallenge() { if (!challengeCrew || challenging) return; setChallenging(true); try { const { error } = await (supabase as any).rpc("challenge_crew", { _challenger: challengeCrew, _opponent: id, _category: challengeCategory }); if (error) throw error; toast.success("Challenge sent"); } catch { toast.error("Could not send this crew challenge. Please try again."); } finally { setChallenging(false); } }
  async function refreshCrew() { await qc.invalidateQueries({ queryKey: ["crew", id] }); await qc.invalidateQueries({ queryKey: ["my-crews", user.id] }); }
  async function changeCapacity(value: number) { setSaving(true); try { const { error } = await supabase.rpc("update_crew_capacity" as any, { _crew: id, _max_members: value }); if (error) throw error; toast.success("Crew capacity updated"); await refreshCrew(); } catch { toast.error("Could not update crew capacity. Please try again."); } finally { setSaving(false); } }
  async function rotateInvite() { if (!window.confirm("Create a new invite code? The old link will stop working.")) return; setSaving(true); try { const { error } = await supabase.rpc("rotate_crew_invite" as any, { _crew: id }); if (error) throw error; toast.success("Invite code refreshed"); await refreshCrew(); } catch { toast.error("Could not refresh the invite code. Please try again."); } finally { setSaving(false); } }
  async function removeMember(memberId: string, username: string) { if (!window.confirm(`Remove @${username} from this crew?`)) return; setSaving(true); try { const { error } = await supabase.rpc("remove_crew_member" as any, { _crew: id, _member: memberId }); if (error) throw error; toast.success("Member removed"); await refreshCrew(); } catch { toast.error("Could not remove this crew member. Please try again."); } finally { setSaving(false); } }
  async function copyCode() {
    if (!data?.code) return;
    try { await navigator.clipboard.writeText(String(data.code)); toast.success("Crew code copied"); }
    catch { toast.error("Could not copy the code."); }
  }
  async function copyInvite() {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${data.code}`);
      toast.success("Invite link copied");
    } catch { toast.error("Could not copy. Use the invite code instead."); }
  }
  async function leave() {
    if (leaving || !window.confirm("Leave this crew?")) return;
    setLeaving(true);
    try {
      const { error } = await supabase.from("crew_members").delete().eq("crew_id", id).eq("user_id", user.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["my-crews", user.id] });
      await qc.invalidateQueries({ queryKey: ["crew", id] });
      toast.success("You left the crew");
      navigate({ to: "/crews" });
    } catch { toast.error("Could not leave this crew. Please try again."); }
    finally { setLeaving(false); }
  }
  if (isLoading) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  if (isError && !data) return <PageShell><div className="py-10 text-center"><p className="font-semibold">This crew could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p><Button variant="line" className="mt-4" onClick={() => void refetch()}>Try again</Button></div></PageShell>;
  if (!data?.c) return <PageShell><p>Crew not found.</p></PageShell>;
  return (
    <PageShell>
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 md:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl"/>
        <div className="relative"><div className="flex items-center justify-between"><Link to="/crews" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">← All crews</Link>{isAdmin && <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase text-primary"><ShieldCheck className="h-3.5 w-3.5"/>Admin</span>}</div>
        <p className="eyebrow mt-6 text-primary">REPUNIT CREW</p><h1 className="font-stat mt-2 break-words text-5xl uppercase md:text-7xl">{data.c.name}</h1>
        {data.c.description && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{data.c.description}</p>}
        <div className="mt-6 grid max-w-xl grid-cols-2 gap-3"><div className="rounded-xl border border-border bg-background/60 p-3"><p className="font-stat text-3xl">{count}<span className="text-lg text-muted-foreground">/{cap}</span></p><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Members</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.min(100,count/cap*100)}%`}}/></div></div><div className="rounded-xl border border-border bg-background/60 p-3"><p className="font-stat text-3xl">{Math.max(0,cap-count)}</p><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Open spots</p></div></div></div>
      </div>
      <div className="mt-4 grid max-w-xl grid-cols-2 gap-3">
        <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Crew total</p><p className="font-stat mt-1 text-2xl">{Math.round(data.crewScore?.total ?? 0).toLocaleString()} kg</p><p className="text-[10px] text-muted-foreground">Logged PR volume</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Weekly wins</p><p className="font-stat mt-1 text-2xl">{data.crewScore?.wins ?? 0}</p><p className="text-[10px] text-muted-foreground">Crew battles won</p></div>
      </div>
      {false && <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1.5 text-primary"><Zap className="h-4 w-4"/><span className="text-[9px] font-black uppercase tracking-widest">Crew level</span></div><p className="font-stat mt-1 text-2xl">{crewLevel.icon} {crewLevel.name}</p><p className="text-[10px] text-muted-foreground">{Number((data.c as any).total_xp ?? 0).toLocaleString()} XP</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1.5 text-primary"><Trophy className="h-4 w-4"/><span className="text-[9px] font-black uppercase tracking-widest">Total tonnage</span></div><p className="font-stat mt-1 text-2xl">{Math.round(data.tonnage).toLocaleString()} kg</p><p className="text-[10px] text-muted-foreground">Logged volume</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1.5 text-primary"><Swords className="h-4 w-4"/><span className="text-[9px] font-black uppercase tracking-widest">Battle wins</span></div><p className="font-stat mt-1 text-2xl">{data.battleWins}</p><p className="text-[10px] text-muted-foreground">Completed weekly battles</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1.5 text-primary"><Medal className="h-4 w-4"/><span className="text-[9px] font-black uppercase tracking-widest">Crew badges</span></div><p className="font-stat mt-1 text-2xl">{data.badges.length}</p><p className="text-[10px] text-muted-foreground">Achievements earned</p></div>
      </div>
      <FunStatsCard kg={data.monthTonnage} headline="THIS MONTH · CREW POWER" prefix={`${data.c.name} lifted`} />\n      {data.badges.length > 0 && <section className="mt-5 rounded-2xl border border-border bg-card p-4"><p className="eyebrow">CREW COLLECTION</p><h2 className="font-stat mt-1 text-2xl uppercase">Badges</h2><div className="mt-3 flex flex-wrap gap-2">{data.badges.map((badge:any)=><span key={badge.id} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">{badge.achievement_key.startsWith("crew_battle_winner:")?"⚔️ Battle winner":badge.achievement_key.replace(/_/g," ")}</span>)}</div></section>}
      </>}
      {false && myAdminCrews.length > 0 && <section className="mt-5 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"><div className="flex items-center gap-2"><Swords className="h-4 w-4 text-primary"/><h2 className="font-bold">Challenge this crew</h2></div><p className="mt-1 text-xs text-muted-foreground">Send a seven-day battle from one of your crews.</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select value={challengeCrew} onChange={e=>setChallengeCrew(e.target.value)} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Choose your crew</option>{myAdminCrews.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={challengeCategory} onChange={e=>setChallengeCategory(e.target.value as any)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="bench">Bench</option><option value="squat">Squat</option><option value="deadlift">Deadlift</option><option value="volume">Total volume</option></select><Button variant="hero" disabled={!challengeCrew||challenging} onClick={sendCrewChallenge}>{challenging?"Sending…":"Challenge"}</Button></div></section>}
      {!isMember && data.c.is_public && <Button className="mt-4" variant="hero" disabled={saving} onClick={joinPublicCrew}><Users className="mr-1 h-4 w-4"/>{saving ? "Joining…" : "Join this crew"}</Button>}
      {isAdmin && <Button className="mt-4" size="sm" variant="line" disabled={saving} onClick={toggleVisibility}>{data.c.is_public ? "Make crew private" : "Make crew public"}</Button>}
      {!isMember && !data.c.is_public && <p className="mt-4 text-xs text-muted-foreground">This crew is private. Ask a crew admin for an invite link.</p>}
      {data.code && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-border py-4">
          <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Crew code</span><b className="font-mono text-sm tracking-widest">{data.code}</b></div>
          <Button size="sm" variant="line" onClick={copyCode}><Copy />Copy code</Button>
          <Button size="sm" variant="line" onClick={copyInvite}><Copy />Copy invite link</Button>{isAdmin && <Button size="sm" variant="ghost" disabled={saving} onClick={rotateInvite}><RefreshCw className="mr-1 h-4 w-4"/>Refresh code</Button>}
        </div>
      )}
      {isAdmin && <section className="mt-5 rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary"/><h2 className="font-bold">Admin settings</h2></div><p className="mt-1 text-xs text-muted-foreground">Change the maximum number of members. The limit cannot go below the current member count.</p><div className="mt-3 flex flex-wrap gap-2">{[5,10,20,30,40,50,75,100].filter(n=>n>=count).map(n=><Button key={n} size="sm" variant={cap===n?"hero":"line"} disabled={saving||cap===n} onClick={()=>changeCapacity(n)}>{n} members</Button>)}</div></section>}
      <div className="mt-8 flex items-center justify-between"><div><p className="eyebrow">SQUAD PERFORMANCE</p><h2 className="font-stat mt-1 text-3xl uppercase">Crew leaderboard</h2></div><Trophy className="h-6 w-6 text-primary"/></div>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {EXERCISES.map((e) => <Button key={e.id} size="sm" variant={e.id === ex ? "hero" : "line"} onClick={() => setEx(e.id)}>{e.short}</Button>)}
      </div>
      <div className="mt-6 space-y-6">
        {ranksLoading && !rows.length ? <p>Loading leaderboard…</p> : ranksError && !rows.length ? <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">Crew rankings are temporarily unavailable.</p><Button className="mt-3" size="sm" variant="line" onClick={() => void refetchRanks()}>Retry</Button></div> : rows.length === 0 ? <p className="text-muted-foreground">No lifts from this crew yet.</p> : <><Podium rows={rows.slice(0, 3)} />{rows.length > 3 && <RankList rows={rows.slice(3)} start={3} />}</>}
      </div>
      {isMember ? <CrewBattles crewId={id} userId={user.id} isAdmin={isAdmin} /> : <section className="mt-10 rounded-2xl border border-dashed border-border p-5 text-center"><Swords className="mx-auto h-6 w-6 text-muted-foreground"/><p className="mt-2 text-sm font-bold">Join the crew to view its battle room</p></section>}
      <div className="mt-10 flex items-end justify-between"><div><p className="eyebrow">THE LINEUP</p><h2 className="font-stat mt-1 text-3xl uppercase">Members ({count})</h2></div><Users className="h-6 w-6 text-primary"/></div>
      <ul className="mt-3 divide-y divide-border">
        {data.members.map((member) => <li key={member.user_id} className="flex items-center justify-between py-3">
          <div className="flex min-w-0 items-center gap-3">{member.profiles && <><Link to="/u/$username" params={{username:member.profiles.username}} className="shrink-0 rounded-full transition hover:scale-105 hover:ring-2 hover:ring-primary"><AvatarChip name={member.profiles.username} url={member.profiles.avatar_url} className="h-10 w-10 shrink-0"/></Link><div className="min-w-0"><Link to="/u/$username" params={{ username: member.profiles.username }} className="font-semibold transition hover:text-primary">{member.profiles.display_name || member.profiles.username}</Link><p className="text-xs text-muted-foreground">@{member.profiles.username}</p></div></>}</div>
          <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${member.role === "admin" ? "bg-primary/10 text-primary" : "bg-elevated text-muted-foreground"}`}>{member.role === "admin" ? "Admin" : "Member"}</span>{isAdmin && member.role !== "admin" && <Button size="icon" variant="ghost" disabled={saving} onClick={() => removeMember(member.user_id, member.profiles?.username ?? "member")}><UserMinus className="h-4 w-4"/></Button>}</div>
        </li>)}
      </ul>
      {!isAdmin && <Button variant="line" className="mt-6" disabled={leaving} onClick={leave}><LogOut />{leaving ? "Leaving…" : "Leave crew"}</Button>}
    </PageShell>
  );
}
