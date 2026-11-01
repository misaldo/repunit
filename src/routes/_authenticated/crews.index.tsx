import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/crews/")({
  head: () => ({ meta: [{ title: "My crews — REPUNIT" }, { name: "description", content: "Your crews." }] }),
  component: Crews,
});

function Crews() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["my-crews", user.id],
    queryFn: async () => (await supabase.from("crew_members").select("crew_id, crews(id, name, description)").eq("user_id", user.id)).data ?? [],
  });
  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code"));
    const { data: id, error } = await supabase.rpc("join_crew", { _code: code });
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/crews/$id", params: { id } });
  }
  return (
    <PageShell>
      <div className="flex items-end justify-between">
        <h1 className="font-stat text-6xl uppercase">Crews</h1>
        <Button asChild variant="hero"><Link to="/crews/new">New crew</Link></Button>
      </div>
      <form onSubmit={join} className="mt-6 flex max-w-md gap-2"><Input name="code" placeholder="Invite code" required /><Button variant="line">Join</Button></form>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {data.length === 0 && <li className="text-muted-foreground">You're not in a crew yet.</li>}
        {data.map((m) => m.crews && (
          <li key={m.crew_id}><Link to="/crews/$id" params={{ id: m.crews.id }} className="block rounded-xl border border-border bg-card p-5 hover:border-foreground/30">
            <p className="text-xl font-bold">{m.crews.name}</p><p className="text-sm text-muted-foreground">{m.crews.description}</p>
          </Link></li>
        ))}
      </ul>
    </PageShell>
  );
}
