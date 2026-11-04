import { Flame, Sparkles } from "lucide-react";
import { getLevel, ACHIEVEMENTS } from "@/lib/progression";

type Props = { xp: number; streak: number; longestStreak?: number; achievements?: string[]; compact?: boolean };

export function ProgressionCard({ xp, streak, longestStreak = 0, achievements = [], compact = false }: Props) {
  const level = getLevel(xp);
  return (
    <section className={compact ? "rounded-xl bg-elevated/70 p-3" : "rounded-2xl border border-border bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="text-2xl">{level.icon}</span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Level {level.name}</p><p className="text-xs text-muted-foreground">{xp.toLocaleString()} total XP</p></div></div>
        <div className="text-right"><p className="flex items-center justify-end gap-1 font-stat text-2xl"><Flame className="h-5 w-5 text-primary" />{streak}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">day streak</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={Math.round(level.progress)} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress to next level"><div className="h-full rounded-full bg-primary transition-all" style={{ width: level.progress + "%" }} /></div>
      <p className="mt-1.5 text-xs text-muted-foreground">{level.next ? `${level.needed.toLocaleString()} XP to ${level.next.name}` : "Maximum level reached"} · longest streak {longestStreak} days</p>
      {!compact && <div className="mt-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Achievements <span className="text-xs font-normal text-muted-foreground">{achievements.length}/{Object.keys(ACHIEVEMENTS).length}</span></h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(ACHIEVEMENTS).map(([key, item]) => { const earned = achievements.includes(key); return <div key={key} className={`rounded-xl border p-3 ${earned ? "border-primary/40 bg-primary/5" : "border-border bg-background opacity-55"}`}><span className="text-2xl">{item.icon}</span><p className="mt-2 text-xs font-bold">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{earned ? "Unlocked" : item.description}</p></div>; })}</div></div>}
    </section>
  );
}
