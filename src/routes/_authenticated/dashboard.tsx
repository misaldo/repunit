import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ property: "og:title", content: "Dashboard — REPUNIT" }, { property: "og:description", content: "Your REPUNIT home." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Dashboard — REPUNIT" }, { name: "description", content: "Your REPUNIT home." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: p } = useMyProfile(user.id);
  return (
    <PageShell>
      <p className="eyebrow">Welcome back</p>
      <h1 className="font-stat mt-2 text-6xl uppercase">{p ? `@${p.username}` : "Lifter"}</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Button asChild variant="hero" className="h-14"><Link to="/records/new">Submit a lift</Link></Button>
        <Button asChild variant="line" className="h-14"><Link to="/crews">My crews</Link></Button>
        <Button asChild variant="line" className="h-14"><Link to="/leaderboards">Leaderboards</Link></Button>
        <Button asChild variant="line" className="h-14"><Link to="/settings">Edit profile</Link></Button>
      </div>
    </PageShell>
  );
}
