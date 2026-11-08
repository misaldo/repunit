import { useState } from "react";
import { Flame, Sparkles, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { getLevel, ACHIEVEMENTS } from "@/lib/progression";
import { AnimatedNumber } from "@/components/animated-number";

type Props = { xp: number; streak: number; longestStreak?: number; achievements?: string[]; compact?: boolean; bestPrKg?: number };

export function ProgressionCard({ xp, streak, longestStreak = 0, achievements = [], compact = false, bestPrKg = 0 }: Props) {
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const level = getLevel(xp);
  const kgToNextLevel = level.next ? Math.max(0, level.next.strengthTargetKg - Math.max(0, bestPrKg)) : 0;
  const entries = Object.entries(ACHIEVEMENTS);
  const earned = entries.filter(([key]) => achievements.includes(key));
  const ordered = [...earned, ...entries.filter(([key]) => !achievements.includes(key))];
  const visibleAchievements = showAllAchievements ? ordered : ordered.slice(0, 10);
  const collapseButton = (
    <button type="button" onClick={() => setShowAllAchievements(false)} aria-expanded={showAllAchievements} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-xs font-bold text-foreground transition hover:border-primary/50 hover:bg-primary/[0.06]">
      Show less <ChevronUp className="h-4 w-4" />
    </button>
  );
  return (
    <section className={compact ? "rounded-xl bg-elevated/70 p-3" : "rounded-2xl border border-border bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="text-2xl">{level.icon}</span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Level {level.name}</p><p className="text-xs text-muted-foreground"><AnimatedNumber value={xp} /> total XP</p></div></div>
        <div className="text-right"><p className="flex items-center justify-end gap-1 font-stat text-2xl"><Flame className="h-5 w-5 text-primary" /><AnimatedNumber value={streak} /></p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">day streak</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={Math.round(level.progress)} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress to next level"><div className="h-full rounded-full bg-primary transition-all" style={{ width: level.progress + "%" }} /></div>
      <p className="mt-1.5 text-xs text-muted-foreground">{level.next ? `${level.needed.toLocaleString()} XP to ${level.next.name}` : "Maximum XP level reached"} · longest streak {longestStreak} days</p>
      <p className="mt-1 text-xs font-semibold text-primary">{level.next ? `${kgToNextLevel.toLocaleString()} kg to ${level.next.name}` : "Top level unlocked"} <span className="font-normal text-muted-foreground">· best verified PR {bestPrKg.toLocaleString()} kg</span></p>
      {!compact && <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Achievement Collection</h3><span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{earned.length} / {entries.length} unlocked</span></div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary transition-all" style={{width:`${earned.length / entries.length * 100}%`}} /></div>
        {showAllAchievements && entries.length > 10 && <div className="mb-3 flex justify-end">{collapseButton}</div>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{visibleAchievements.map(([key, item]) => { const unlocked = achievements.includes(key); return <div key={key} className={`relative min-w-0 rounded-xl border p-3 transition-colors ${unlocked ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-background/60 opacity-60"}`}><div className="flex items-start justify-between gap-2"><span className={`text-2xl ${unlocked ? "" : "grayscale"}`}>{item.icon}</span>{unlocked ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">Unlocked</span> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}</div><p className="mt-2 text-xs font-bold leading-4">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.description}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-[.12em] text-muted-foreground">{item.category}</p></div>; })}</div>
        {entries.length > 10 && <button type="button" onClick={() => setShowAllAchievements((value) => !value)} aria-expanded={showAllAchievements} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-3 text-xs font-bold text-foreground transition hover:border-primary/50 hover:bg-primary/[0.06]">
          {showAllAchievements ? <>Show less <ChevronUp className="h-4 w-4" /></> : <>View all {entries.length} achievements <ChevronDown className="h-4 w-4" /></>}
        </button>}
      </div>}
    </section>
  );
}
