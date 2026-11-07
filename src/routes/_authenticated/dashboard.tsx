import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/use-session";
import { Dumbbell, ArrowRight, Trophy, Users, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ property: "og:title", content: "Home — REPUNIT" }, { property: "og:description", content: "Your REPUNIT home." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Home — REPUNIT" }, { name: "description", content: "Your REPUNIT home." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: p, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useMyProfile(user.id);
  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">YOUR REPUNIT</p><h1 className="font-stat mt-2 text-6xl uppercase">{p ? `@${p.username}` : profileLoading ? "Loading profile…" : "Home"}</h1>{profileError && <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><span>Profile could not be loaded.</span><button type="button" onClick={() => void refetchProfile()} className="font-semibold text-primary underline underline-offset-4">Try again</button></div>}<p className="mt-2 text-sm text-muted-foreground">Your training. Your crew. Your progress.</p></div><Button asChild variant="hero" className="h-12"><Link to="/records/new"><Dumbbell className="mr-2 h-4 w-4"/>Submit a lift<ArrowRight className="ml-2 h-4 w-4"/></Link></Button></div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link to="/leaderboards" className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-elevated active:scale-[.99]"><Trophy className="h-5 w-5 text-primary transition group-hover:scale-110"/><p className="mt-3 font-bold">Ranks</p><p className="mt-1 text-xs text-muted-foreground">See where you stand</p></Link>
        <Link to="/crews" className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-elevated active:scale-[.99]"><Users className="h-5 w-5 text-primary transition group-hover:scale-110"/><p className="mt-3 font-bold">My crews</p><p className="mt-1 text-xs text-muted-foreground">Train as a team</p></Link>
        <Link to="/settings" className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-elevated active:scale-[.99]"><Settings className="h-5 w-5 text-primary transition group-hover:scale-110"/><p className="mt-3 font-bold">Edit profile</p><p className="mt-1 text-xs text-muted-foreground">Make it yours</p></Link>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4"><div><p className="font-bold">Your workouts</p><p className="mt-1 text-xs text-muted-foreground">Keep your plan close and share it with your crew.</p></div><Button asChild variant="line"><Link to="/workouts">Open Workouts<ArrowRight className="ml-2 h-4 w-4"/></Link></Button></div>
    </PageShell>
  );
}
