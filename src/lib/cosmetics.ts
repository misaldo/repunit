import { getLevel } from "@/lib/progression";

/**
 * Cosmetics are earned by leveling up and derived from XP only, so they can
 * never be bought or granted by a client. Each level unlocks a profile frame
 * and a title shown next to the avatar.
 */
export type Cosmetic = {
  levelName: string;
  title: string;
  /** Tailwind classes for a ring around the avatar. */
  frameClass: string;
  /** Tailwind class for the title text color. */
  titleClass: string;
};

const BY_LEVEL: Record<string, Pick<Cosmetic, "frameClass" | "titleClass">> = {
  Foam: { frameClass: "ring-2 ring-zinc-500/60 ring-offset-2 ring-offset-background", titleClass: "text-zinc-400" },
  Tin: { frameClass: "ring-2 ring-slate-300/70 ring-offset-2 ring-offset-background", titleClass: "text-slate-300" },
  Brass: { frameClass: "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background", titleClass: "text-amber-300" },
  Iron: { frameClass: "ring-[3px] ring-sky-400/80 ring-offset-2 ring-offset-background", titleClass: "text-sky-300" },
  Tungsten: { frameClass: "ring-[3px] ring-emerald-400/80 ring-offset-2 ring-offset-background", titleClass: "text-emerald-300" },
  Osmium: { frameClass: "ring-4 ring-violet-400/90 ring-offset-2 ring-offset-background shadow-[0_0_24px_-4px_rgba(167,139,250,.8)]", titleClass: "text-violet-300" },
  "Neutron Star": { frameClass: "ring-4 ring-fuchsia-400 ring-offset-2 ring-offset-background shadow-[0_0_32px_-2px_rgba(232,121,249,.9)]", titleClass: "text-fuchsia-300" },
};

export function cosmeticForXp(xp: number | null | undefined): Cosmetic {
  const level = getLevel(Number(xp ?? 0));
  const style = BY_LEVEL[level.name] ?? BY_LEVEL["Foam"]!;
  return { levelName: level.name, title: `${level.icon} ${level.name}`, ...style };
}
