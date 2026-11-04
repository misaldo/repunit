import { cn } from "@/lib/utils";

function avatarSeed(name: string) {
  return encodeURIComponent(name.trim().toLowerCase() || "repunit-lifter");
}

export function AvatarChip({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const generatedAvatar = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${avatarSeed(name)}&backgroundColor=171717,262626,3b1018,202b3b`;
  return (
    <span className={cn("relative inline-block shrink-0 overflow-visible rounded-full", className)} aria-label={`${name}'s avatar`}>
      <img
        src={url || generatedAvatar}
        alt={`${name}'s avatar`}
        loading="lazy"
        className="h-full w-full rounded-full bg-elevated object-cover ring-1 ring-border"
      />
      <span aria-hidden="true" className="pointer-events-none absolute -right-0.5 -top-0.5 h-[28%] w-[28%] rounded-full border-2 border-background bg-primary shadow-[0_0_9px_hsl(var(--primary)/0.65)]" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-0.5 -left-0.5 h-[24%] w-[24%] rounded-full border-2 border-background bg-zinc-300 shadow-sm" />
    </span>
  );
}
