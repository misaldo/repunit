import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users, Video, ShieldCheck, Trophy, Dumbbell, Zap } from "lucide-react";
import { SiteHeader, SiteFooter, MobileNav } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLeaderboard, Podium } from "@/components/leaderboard-list";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "REPUNIT — Who is the strongest in your crew?" },
      { name: "description", content: "The social strength network. Build your crew, submit lifts with video, climb the leaderboard." },
      { property: "og:title", content: "REPUNIT — Who is the strongest in your crew?" },
      { property: "og:description", content: "Build your crew. Prove your strength. Own your rank." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function HeroMotion() {
  return (
    <div aria-hidden="true" className="repunit-motion absolute inset-0 overflow-hidden">
      <div className="motion-grid" />
      <div className="motion-orbit motion-orbit-one" />
      <div className="motion-orbit motion-orbit-two" />
      <div className="motion-core">
        <div className="motion-core-inner"><Dumbbell className="h-16 w-16 md:h-24 md:w-24" strokeWidth={1.1} /></div>
      </div>
      <div className="motion-ring motion-ring-one" />
      <div className="motion-ring motion-ring-two" />
      <span className="motion-label motion-label-top">REPUNIT / STRENGTH SYSTEM</span>
      <span className="motion-label motion-label-bottom">01 — BUILT TO COMPETE</span>
      <span className="motion-cross motion-cross-one">+</span>
      <span className="motion-cross motion-cross-two">+</span>
    </div>
  );
}

function Landing() {
  const { data: rows = [] } = useLeaderboard("bench");
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="relative isolate overflow-hidden border-b border-border">
        <HeroMotion />
        <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-background/35 to-background" />
        <div className="relative mx-auto flex min-h-[680px] max-w-6xl flex-col justify-end px-4 pb-16 pt-36 md:min-h-[780px] md:pb-24">
          <div className="max-w-5xl">
            <p className="eyebrow rise">REPUNIT · THE CREW STRENGTH NETWORK</p>
            <h1 className="rise mt-5 max-w-5xl text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.055em] sm:text-6xl md:text-8xl lg:text-[7.4rem]">
              Who is the<br />strongest in your <span className="text-primary">crew?</span>
            </h1>
            <p className="rise mt-6 max-w-md text-base text-muted-foreground md:text-lg">Build your crew. Prove your strength. Own your rank.</p>
            <div className="rise mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="hero" className="h-12"><Link to="/crews/new">Create your crew <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="line" className="h-12"><Link to="/leaderboards">Explore leaderboards</Link></Button>
            </div>
          </div>
          <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/10 pt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /> Compete with your crew</span>
            <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-primary" /> Show your proof</span>
            <span className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5 text-primary" /> Claim your rank</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="eyebrow">Live · Global bench press</p>
            <h2 className="mt-2 text-3xl font-bold md:text-5xl">The board right now</h2>
          </div>
          <Link to="/leaderboards" className="text-sm text-muted-foreground hover:text-foreground">All boards →</Link>
        </div>
        {rows.length >= 1 ? (
          <Podium rows={rows.slice(0, 3)} />
        ) : (
          <div className="grid-lines rounded-xl border border-dashed border-border p-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-heading text-xl font-bold">The podium is empty.</p>
            <p className="mt-1 text-sm text-muted-foreground">First lift submitted takes the crown.</p>
            <Button asChild variant="hero" className="mt-5"><Link to="/records/new">Submit a lift</Link></Button>
          </div>
        )}
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-px bg-border md:grid-cols-3">
          {[
            { icon: Users, n: "01", t: "Build your crew", d: "Start a crew, share one link, and every friend lands on the same board." },
            { icon: Video, n: "02", t: "Submit with video", d: "Log weight, reps and date. Attach the clip. Your evidence stays private to members." },
            { icon: ShieldCheck, n: "03", t: "Earn verification", d: "Unverified, reviewed and verified lifts are always labelled. No fake badges." },
          ].map((s) => (
            <div key={s.n} className="bg-surface p-8">
              <div className="flex items-center justify-between"><s.icon className="h-6 w-6 text-primary" /><span className="font-stat text-4xl text-muted-foreground/40">{s.n}</span></div>
              <h3 className="mt-6 text-xl font-bold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card p-8 md:p-12">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <p className="eyebrow">REPUNIT Pro</p>
          <h2 className="mt-2 max-w-lg text-3xl font-bold md:text-4xl">Deeper stats. Sharper rivalries.</h2>
          <p className="mt-3 max-w-md text-muted-foreground">Advanced progress charts, crew analytics and exclusive themes — 99 CZK a month.</p>
          <Button asChild variant="line" className="mt-6"><Link to="/pricing">See plans</Link></Button>
        </div>
      </section>
      <SiteFooter />
      <MobileNav />
    </div>
  );
}
