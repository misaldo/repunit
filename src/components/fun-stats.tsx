import { useEffect, useState } from "react";
import { Sparkles, Scale } from "lucide-react";

const COMPARISONS = [
  { name: "adult elephants", kg: 5000, emoji: "🐘" },
  { name: "average cars", kg: 1500, emoji: "🚗" },
  { name: "city buses", kg: 12000, emoji: "🚌" },
  { name: "grand pianos", kg: 450, emoji: "🎹" },
  { name: "blue whales", kg: 140000, emoji: "🐋" },
  { name: "motorcycles", kg: 200, emoji: "🏍️" },
  { name: "small delivery vans", kg: 2500, emoji: "🚐" },
  { name: "adult giraffes", kg: 1200, emoji: "🦒" },
];

export function formatLiftVolume(kg: number) {
  if (!Number.isFinite(kg) || kg <= 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} tons`;
  return `${Math.round(kg).toLocaleString()} kg`;
}

export function getFunComparison(kg: number, index = 0) {
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const ordered = [...COMPARISONS].sort((a, b) => {
    const countA = Math.max(1, Math.round(kg / a.kg));
    const countB = Math.max(1, Math.round(kg / b.kg));
    return Math.abs(kg - countA * a.kg) / kg - Math.abs(kg - countB * b.kg) / kg;
  });
  const comparison = ordered[((index % ordered.length) + ordered.length) % ordered.length];
  const count = Math.max(1, Math.round(kg / comparison.kg));
  return { ...comparison, count, label: `${count.toLocaleString()} ${comparison.name}` };
}

export function FunStatsCard({ kg, headline = "THE NUMBERS HIT DIFFERENT", prefix = "Your crew" }: { kg: number; headline?: string; prefix?: string }) {
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    try {
      const key = "repunit-fun-stats-rotation";
      const previous = Number(localStorage.getItem(key) ?? "-1");
      const next = (Number.isFinite(previous) ? previous + 1 : 0) % COMPARISONS.length;
      setRotation(next);
      localStorage.setItem(key, String(next));
    } catch { setRotation(0); }
  }, []);
  const comparison = getFunComparison(kg, rotation);
  if (!comparison) return null;
  return <section className="fun-stats-card relative mt-5 overflow-hidden rounded-2xl border border-primary/25 bg-card p-4 sm:p-5" aria-label="Fun lifting statistic">
    <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
    <div className="relative flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-primary">{headline}</p>
        <p className="mt-1 text-sm text-muted-foreground">{prefix} moved</p>
        <p className="font-stat mt-0.5 text-3xl uppercase sm:text-4xl">{formatLiftVolume(kg)}</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
          <span className="text-2xl" aria-hidden="true">{comparison.emoji}</span>
          <p className="text-sm">That’s roughly the weight of <strong className="text-foreground">{comparison.label}</strong>.</p>
        </div>
      </div>
      <Scale className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
    </div>
  </section>;
}
