import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/use-session";
import { Dumbbell, ArrowRight } from "lucide-react";

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
      <div className="mt-8">
        <Button asChild variant="hero" className="h-16 w-full justify-center text-base shadow-[0_0_32px_hsl(var(--primary)/0.22)] sm:max-w-xl">
          <Link to="/records/new"><Dumbbell className="mr-2 h-5 w-5" />Submit a lift<ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button asChild variant="line" className="h-14"><Link to="/crews">My crews</Link></Button>
        <Button asChild variant="line" className="h-14"><Link to="/leaderboards">Leaderboards</Link></Button>
        <Button asChild variant="line" className="h-14"><Link to="/settings">Edit profile</Link></Button>
      </div>
    </PageShell>
  );
}
