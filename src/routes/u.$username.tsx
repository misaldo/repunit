import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AvatarChip } from "@/components/avatar-chip";
import { StatusBadge } from "@/components/status-badge";
import { EXERCISES, exerciseLabel } from "@/lib/lifts";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: `@${params.username} — REPUNIT` }, { name: "description", content: `Lifting records of @${params.username}.` }, { property: "og:title", content: `@${params.username} on REPUNIT` }, { property: "og:description", content: "Personal records and rank." }] }),
  component: Profile,
});

function Profile() {
  const { username } = Route.useParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data: p, error } = await supabase.from("profiles").select("id, username, display_name, bio, avatar_url, created_at").eq("username", username).maybeSingle();
      if (error) throw error;
      if (!p) return null;
      const { data: lifts, error: liftsError } = await supabase.from("lifts").select("*").eq("user_id", p.id).order("lifted_on", { ascending: false });
      if (liftsError) throw liftsError;
      return { p, lifts: lifts ?? [] };
    },
  });
  if (isLoading) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  if (isError) return <PageShell><p>Could not load this profile.</p><Button variant="line" className="mt-4" onClick={() => refetch()}>Try again</Button></PageShell>;
  if (!data) return <PageShell><p>Lifter not found.</p></PageShell>;
  const { p, lifts } = data;
  return (
    <PageShell>
      <div className="flex items-center gap-4">
        <AvatarChip name={p.username} url={p.avatar_url} className="h-20 w-20 text-xl" />
        <div>
          <h1 className="text-3xl font-bold">{p.display_name ?? p.username}</h1>
          <p className="text-muted-foreground">@{p.username} · joined {new Date(p.created_at).toLocaleDateString()}</p>
        </div>
      </div>
      {p.bio && <p className="mt-4 max-w-xl">{p.bio}</p>}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {EXERCISES.map((e) => {
          const best = lifts.filter((l) => l.exercise === e.id && l.status !== "REJECTED").sort((a, b) => Number(b.weight_kg) - Number(a.weight_kg))[0];
          return (
            <div key={e.id} className="rounded-xl border border-border bg-card p-4">
              <p className="eyebrow">{e.short}</p>
              <p className="font-stat mt-2 text-4xl">{best ? Number(best.weight_kg) : "—"}<span className="text-sm text-muted-foreground">{best ? "kg" : ""}</span></p>
              {best && <StatusBadge status={best.status} className="mt-2" />}
            </div>
          );
        })}
      </div>
      <h2 className="mt-10 text-xl font-bold">History</h2>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
        {lifts.length === 0 && <li className="p-4 text-sm text-muted-foreground">No lifts yet.</li>}
        {lifts.map((l) => (
          <li key={l.id}><Link to="/records/$id" params={{ id: l.id }} className="flex items-center justify-between p-4 hover:bg-elevated">
            <span><span className="font-semibold">{exerciseLabel(l.exercise)}</span> <span className="text-sm text-muted-foreground">{l.lifted_on}</span></span>
            <span className="flex items-center gap-3"><StatusBadge status={l.status} /><span className="font-stat text-2xl">{Number(l.weight_kg)}×{l.reps}</span></span>
          </Link></li>
        ))}
      </ul>
    </PageShell>
  );
}
