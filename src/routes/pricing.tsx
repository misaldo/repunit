import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Crown, Zap, ShieldCheck, Sparkles, CreditCard, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "REPUNIT PRO — Pricing" }, { name: "description", content: "Upgrade your training with REPUNIT PRO." }, { property: "og:title", content: "REPUNIT PRO — Pricing" }, { property: "og:description", content: "Train smarter. Track deeper. Compete harder." }] }),
  component: Pricing,
});

const benefits = [
  "Six-month training volume charts and verified lift analytics",
  "REPUNIT Strength Score from your best estimated Big Three 1RMs",
  "Unlimited workout plans (Free includes up to 3)",
  "PRO-only profile themes: Ember, Steel and Violet",
  "Exclusive REPUNIT PRO profile badge",
];

function Pricing() {
  const { user } = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const subscription = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("user_subscriptions")
        .select("status,current_period_end,cancel_at_period_end")
        .eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isPro = ["active", "trialing"].includes(subscription.data?.status ?? "");

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("checkout");
    if (result === "success") {
      toast.success("Checkout completed", { description: "Your PRO status will appear as soon as Stripe confirms the subscription." });
      void qc.invalidateQueries({ queryKey: ["subscription", user?.id] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (result === "cancelled") {
      toast("Checkout cancelled", { description: "No payment was made." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc, user?.id]);

  async function startCheckout() {
    if (!user) {
      await navigate({ to: "/auth", search: { redirect: "/pricing" } });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe", { body: { action: "checkout", plan: billing } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Stripe did not return a checkout URL.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Could not start secure checkout. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function manageSubscription() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe", { body: { action: "portal" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Stripe did not return a portal URL.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Could not open subscription settings. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"/>
        <div className="relative">
          <p className="eyebrow text-primary">TRAIN SMARTER. COMPETE HARDER.</p>
          <h1 className="font-stat mt-3 text-6xl uppercase sm:text-8xl">REPUNIT <span className="text-primary">PRO.</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">More insight into every rep. More control over your training. More ways to prove what you can do.</p>
          {isPro && <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary"><Crown className="h-4 w-4"/> PRO ACTIVE {subscription.data?.current_period_end ? `· renews ${new Date(subscription.data.current_period_end).toLocaleDateString()}` : ""}</div>}
        </div>
      </section>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Billing</span>
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          <button type="button" onClick={() => setBilling("monthly")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${billing === "monthly" ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Monthly</button>
          <button type="button" onClick={() => setBilling("yearly")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${billing === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Yearly · Save 33%</button>
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-5xl gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-6 sm:p-7">
          <p className="eyebrow">START HERE</p>
          <h2 className="font-stat mt-2 text-4xl uppercase">Free</h2>
          <p className="font-stat mt-5 text-5xl">$0<span className="ml-2 text-sm font-sans text-muted-foreground">forever</span></p>
          <p className="mt-3 text-sm text-muted-foreground">Everything you need to join the REPUNIT community.</p>
          <ul className="mt-6 space-y-3 text-sm">{["Public lifter profile", "Lift records and video evidence", "Create and join Crews", "Global strength leaderboards", "Follow friends and join challenges", "Up to 3 saved workout plans"].map((item)=><li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{item}</li>)}</ul>
          <Button asChild variant="line" className="mt-8 w-full"><a href={user ? "/dashboard" : "/auth"}>Continue with Free</a></Button>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-primary/50 bg-card p-6 shadow-glow sm:p-7">
          <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-primary-foreground">Built for progress</div>
          <p className="eyebrow text-primary">THE FULL REPUNIT EXPERIENCE</p>
          <h2 className="font-stat mt-2 text-4xl uppercase">Pro <Crown className="inline h-7 w-7 text-primary"/></h2>
          <div className="mt-5 flex items-end gap-2"><p className="font-stat text-5xl">{billing === "yearly" ? "$39.99" : "$4.99"}</p><p className="pb-1 text-sm text-muted-foreground">/{billing === "yearly" ? "year" : "month"}</p></div>
          {billing === "yearly" && <p className="mt-1 text-xs font-semibold text-primary">Just $3.33/month · Save $19.89 per year</p>}
          <p className="mt-3 text-sm text-muted-foreground">A deeper look at your strength, consistency and crew performance.</p>
          <ul className="mt-6 space-y-3 text-sm">{benefits.map((item)=><li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{item}</li>)}</ul>
          {isPro
            ? <Button variant="hero" className="mt-8 w-full" onClick={() => void manageSubscription()} disabled={busy}><CreditCard className="mr-2 h-4 w-4"/>{busy ? "Opening Stripe…" : "Manage subscription"}</Button>
            : <Button variant="hero" className="mt-8 w-full" onClick={() => void startCheckout()} disabled={busy || subscription.isLoading}><Zap className="mr-2 h-4 w-4"/>{busy ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Opening secure checkout…</> : "Go PRO"}</Button>}
          <p className="mt-3 text-center text-[10px] text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/>Secure payments powered by Stripe. Cancel anytime.</p>
        </article>
      </div>
      <div className="mx-auto mt-6 flex max-w-5xl items-start gap-3 rounded-2xl border border-border bg-background/70 p-4 text-xs leading-relaxed text-muted-foreground"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><p>Subscriptions are activated by a verified Stripe webhook. If your PRO status does not update after checkout, refresh this page after a moment or use Manage subscription once the account is linked.</p></div>
    </PageShell>
  );
}
