import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LogOut } from "lucide-react";
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
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const [ex, setEx] = useState<Exercise>("bench");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crew", id],
    queryFn: async () => {
      const { data: c, error } = await supabase.from("crews").select("id, name, description, owner_id").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: code, error: codeError } = await supabase.rpc("crew_invite_code", { _crew: id });
      if (codeError) throw codeError;
      const { data: members, error: membersError } = await supabase.from("crew_members").select("user_id, role, profiles(username)").eq("crew_id", id).order("joined_at");
      if (membersError) throw membersError;
      return { c, code, members: members ?? [] };
    },
  });
  const { data: rows = [], isLoading: ranksLoading, isError: ranksError } = useLeaderboard(ex, id);
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
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not leave crew."); }
    finally { setLeaving(false); }
  }
  if (isLoading) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  if (isError) return <PageShell><p>Could not load this crew.</p><Button variant="line" className="mt-4" onClick={() => refetch()}>Try again</Button></PageShell>;
  if (!data?.c) return <PageShell><p>Crew not found.</p></PageShell>;
  return (
    <PageShell>
      <p className="eyebrow">{data.members.length} members</p>
      <h1 className="font-stat mt-2 text-6xl uppercase">{data.c.name}</h1>
      {data.c.description && <p className="mt-2 text-muted-foreground">{data.c.description}</p>}
      {data.code && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-border py-4">
          <span className="text-sm">Invite code: <b className="font-mono">{data.code}</b></span>
          <Button size="sm" variant="line" onClick={copyInvite}><Copy />Copy invite link</Button>
        </div>
      )}
      <div className="mt-6 flex gap-2 overflow-x-auto">
        {EXERCISES.map((e) => <Button key={e.id} size="sm" variant={e.id === ex ? "hero" : "line"} onClick={() => setEx(e.id)}>{e.short}</Button>)}
      </div>
      <div className="mt-6 space-y-6">
        {ranksLoading ? <p>Loading leaderboard…</p> : ranksError ? <p>Could not load the leaderboard.</p> : rows.length === 0 ? <p className="text-muted-foreground">No lifts from this crew yet.</p> : <><Podium rows={rows.slice(0, 3)} />{rows.length > 3 && <RankList rows={rows.slice(3)} start={3} />}</>}
      </div>
      <h2 className="mt-10 text-xl font-bold">Members</h2>
      <ul className="mt-3 divide-y divide-border">
        {data.members.map((member) => <li key={member.user_id} className="flex items-center justify-between py-3">
          {member.profiles && <Link to="/u/$username" params={{ username: member.profiles.username }}>@{member.profiles.username}</Link>}
          <span className="text-xs uppercase text-muted-foreground">{member.role}</span>
        </li>)}
      </ul>
      {data.members.some((m) => m.user_id === user.id && m.role !== "owner") && <Button variant="line" className="mt-6" disabled={leaving} onClick={leave}><LogOut />{leaving ? "Leaving…" : "Leave crew"}</Button>}
    </PageShell>
  );
}
