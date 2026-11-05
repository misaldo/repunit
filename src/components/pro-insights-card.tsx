import { useMemo } from "react";
import { Activity, TrendingUp, Trophy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { estimated1RM, exerciseLabel } from "@/lib/lifts";
import { AnimatedNumber } from "@/components/animated-number";

type Lift = { exercise: string; weight_kg: number; reps: number | null; status: string; lifted_on: string };

export function ProInsightsCard({ lifts }: { lifts: Lift[] }) {
  const insights = useMemo(() => {
    const verified = lifts.filter((lift) => lift.status === "VERIFIED");
    const bigThree = ["bench", "squat", "deadlift"];
    const best = bigThree.map((exercise) => {
      const records = verified.filter((lift) => lift.exercise === exercise);
      const top = records.reduce<Lift | null>((current, lift) => {
        if (!current) return lift;
        return estimated1RM(Number(lift.weight_kg), Number(lift.reps ?? 1)) > estimated1RM(Number(current.weight_kg), Number(current.reps ?? 1)) ? lift : current;
      }, null);
      return { exercise, lift: top, oneRm: top ? estimated1RM(Number(top.weight_kg), Number(top.reps ?? 1)) : 0 };
    });
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const volume = verified.filter((lift) => String(lift.lifted_on).startsWith(key))
        .reduce((sum, lift) => sum + Number(lift.weight_kg) * Number(lift.reps ?? 1), 0);
      return { month: date.toLocaleDateString("en-US", { month: "short" }), volume: Math.round(volume), key };
    });
    return { best, months, strengthScore: best.reduce((sum, row) => sum + row.oneRm, 0), verifiedCount: verified.length };
  }, [lifts]);

  return (
    <section className="mt-6 rounded-2xl border border-primary/25 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow text-primary">PRO PERFORMANCE LAB</p><h2 className="font-stat mt-1 text-3xl uppercase">Your strength, decoded.</h2></div><span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">PRO</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-background p-4 sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">REPUNIT Strength Score</p><p className="font-stat mt-1 text-4xl"><AnimatedNumber value={Math.round(insights.strengthScore)} /> <span className="text-base text-muted-foreground">kg</span></p><p className="mt-1 text-[10px] text-muted-foreground">Sum of your best estimated 1RMs across bench, squat and deadlift.</p></div>
        <div className="rounded-xl bg-background p-4"><Trophy className="h-4 w-4 text-primary"/><p className="mt-2 font-stat text-3xl"><AnimatedNumber value={insights.verifiedCount}/></p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Verified lifts</p></div>
        <div className="rounded-xl bg-background p-4"><TrendingUp className="h-4 w-4 text-primary"/><p className="mt-2 font-stat text-3xl"><AnimatedNumber value={insights.months[5]?.volume ?? 0}/></p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">This month's volume · kg</p></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><Activity className="h-4 w-4 text-primary"/> Big three estimated 1RM</h3>
          <div className="mt-3 space-y-3">{insights.best.map((row) => <div key={row.exercise} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"><span className="text-sm text-muted-foreground">{exerciseLabel(row.exercise as any)}</span><strong className="font-stat text-2xl">{row.oneRm ? `${row.oneRm.toLocaleString("en-US")} kg` : "—"}</strong></div>)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest">Six-month training volume</h3>
          {insights.verifiedCount === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Verified lifts will build your progress chart.</p> : <div className="mt-3 h-48 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={insights.months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="repunitVolumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${Number(value).toLocaleString("en-US")} kg`, "Volume"]}/><Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#repunitVolumeFill)" activeDot={{ r: 4 }}/></AreaChart></ResponsiveContainer></div>}
        </div>
      </div>
    </section>
  );
}
