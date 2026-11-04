import { Flame, Sparkles, Lock } from "lucide-react";
import { getLevel, ACHIEVEMENTS } from "@/lib/progression";

type Props = { xp: number; streak: number; longestStreak?: number; achievements?: string[]; compact?: boolean };

export function ProgressionCard({ xp, streak, longestStreak = 0, achievements = [], compact = false }: Props) {
  const level = getLevel(xp);
  const entries = Object.entries(ACHIEVEMENTS);
  const earned = entries.filter(([key]) => achievements.includes(key));
  const ordered = [...earned, ...entries.filter(([key]) => !achievements.includes(key))];
  return (
    <section className={compact ? "rounded-xl bg-elevated/70 p-3" : "rounded-2xl border border-border bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="text-2xl">{level.icon}</span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Level {level.name}</p><p className="text-xs text-muted-foreground">{xp.toLocaleString()} total XP</p></div></div>
        <div className="text-right"><p className="flex items-center justify-end gap-1 font-stat text-2xl"><Flame className="h-5 w-5 text-primary" />{streak}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">day streak</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={Math.round(level.progress)} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress to next level"><div className="h-full rounded-full bg-primary transition-all" style={{ width: level.progress + "%" }} /></div>
      <p className="mt-1.5 text-xs text-muted-foreground">{level.next ? `${level.needed.toLocaleString()} XP to ${level.next.name}` : "Maximum level reached"} · longest streak {longestStreak} days</p>
      {!compact && <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Achievement Collection</h3><span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{earned.length} / {entries.length} unlocked</span></div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary transition-all" style={{width:`${earned.length / entries.length * 100}%`}} /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{ordered.map(([key, item]) => { const unlocked = achievements.includes(key); return <div key={key} className={`relative min-w-0 rounded-xl border p-3 transition-colors ${unlocked ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-background/60 opacity-60"}`}><div className="flex items-start justify-between gap-2"><span className={`text-2xl ${unlocked ? "" : "grayscale"}`}>{item.icon}</span>{unlocked ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">Unlocked</span> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}</div><p className="mt-2 text-xs font-bold leading-4">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.description}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-[.12em] text-muted-foreground">{item.category}</p></div>; })}</div>
      </div>}
    </section>
  );
}
