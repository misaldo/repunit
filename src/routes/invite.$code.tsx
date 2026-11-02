import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/invite/$code")({
  head: () => ({ meta: [
    { title: "Crew invitation — REPUNIT" },
    { name: "description", content: "Join your friends' REPUNIT crew." },
    { property: "og:title", content: "Crew invitation — REPUNIT" },
    { property: "og:description", content: "Your crew is waiting. Strength is social." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Invite,
});

function Invite() {
  const { code } = Route.useParams();
  const { user, ready } = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crew-invite", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crew_preview", { _code: code });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  async function join() {
    if (busy || !user) return;
    setBusy(true);
    try {
      const { data: id, error } = await supabase.rpc("join_crew", { _code: code });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["my-crews", user.id] });
      toast.success("Welcome to the crew");
      navigate({ to: "/crews/$id", params: { id } });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not join crew."); }
    finally { setBusy(false); }
  }
  return <PageShell>
    <Users className="h-10 w-10 text-primary" />
    {isLoading ? <p className="mt-6">Loading invitation…</p> : isError ? <div className="mt-6"><p>Could not load this invitation.</p><Button variant="line" className="mt-4" onClick={() => refetch()}>Try again</Button></div> : !data ? <><h1 className="mt-6 text-3xl font-bold">Invitation not found</h1><p className="mt-3 text-muted-foreground">Ask your friend for a new invite link.</p></> : <>
      <p className="eyebrow mt-6">Crew invitation · {data.member_count} members</p>
      <h1 className="font-stat mt-3 break-words text-6xl uppercase">{data.name}</h1>
      {data.description && <p className="mt-4 max-w-xl text-muted-foreground">{data.description}</p>}
      {ready && (user ? <Button variant="hero" className="mt-6" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join crew"}</Button> : <Button asChild variant="hero" className="mt-6"><Link to="/auth" search={{ redirect: `/invite/${code}` }}>Sign in to join</Link></Button>)}
    </>}
  </PageShell>;
}