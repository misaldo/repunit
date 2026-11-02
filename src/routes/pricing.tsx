import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PageShell } from "@/components/app-shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Pricing — REPUNIT" }, { name: "description", content: "REPUNIT Free and Pro plans." }, { property: "og:title", content: "Pricing — REPUNIT" }, { property: "og:description", content: "Free forever, Pro for 99 CZK/month." }] }),
  component: Pricing,
});

const PLANS = [
  { name: "Free", price: "0 CZK", items: ["Public profile", "Basic records", "Basic crews", "Basic leaderboards", "Limited statistics"] },
  { name: "Pro", price: "99 CZK / month", items: ["Advanced statistics", "Detailed progress charts", "Profile customization", "Crew analytics", "Extended competition history", "Exclusive themes"] },
];

function Pricing() {
  return (
    <PageShell>
      <h1 className="font-stat text-6xl uppercase">Pricing</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.name} className="rounded-2xl border border-border bg-card p-6">
            <p className="eyebrow">{p.name}</p>
            <p className="font-stat mt-2 text-5xl">{p.price}</p>
            <ul className="mt-6 space-y-2 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{i}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Pro checkout is coming soon. Cancel anytime, no hidden fees.</p>
    </PageShell>
  );
}
