export const LEVELS = [
  { name: "Rookie", min: 0, max: 100, icon: "🥉" },
  { name: "Lifter", min: 100, max: 300, icon: "🏋️" },
  { name: "Athlete", min: 300, max: 700, icon: "⚡" },
  { name: "Beast", min: 700, max: 1500, icon: "🐺" },
  { name: "Titan", min: 1500, max: 3000, icon: "🛡️" },
  { name: "Legend", min: 3000, max: 3000, icon: "👑" },
] as const;

export function getLevel(xp: number) {
  const safeXp = Math.max(0, xp || 0);
  const index = LEVELS.findIndex((level, i) => i === LEVELS.length - 1 || safeXp < LEVELS[i + 1]!.min);
  const current = LEVELS[Math.max(0, index)] ?? LEVELS[0];
  const next = LEVELS[index + 1];
  const progress = next ? Math.min(100, Math.max(0, ((safeXp - current.min) / (next.min - current.min)) * 100)) : 100;
  return { ...current, next, progress, intoLevel: safeXp - current.min, needed: next ? next.min - safeXp : 0 };
}

export const ACHIEVEMENTS: Record<string, { title: string; description: string; icon: string }> = {
  first_pr: { title: "First PR", description: "Log your first personal record.", icon: "🏆" },
  bench_100: { title: "100 kg Bench Club", description: "Log a bench press of at least 100 kg.", icon: "💯" },
  streak_7: { title: "One Week Strong", description: "Reach a 7-day training streak.", icon: "🔥" },
  volume_1000: { title: "1,000 kg Volume", description: "Log 1,000 kg of total lifted volume.", icon: "📈" },
};
