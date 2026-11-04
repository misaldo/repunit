import { cn } from "@/lib/utils";

function avatarSeed(name: string) {
  return encodeURIComponent(name.trim().toLowerCase() || "repunit-lifter");
}

export function AvatarChip({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const generatedAvatar = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${avatarSeed(name)}&backgroundColor=171717,262626,3b1018,202b3b`;
  return <img
    src={url || generatedAvatar}
    alt={`${name}'s avatar`}
    loading="lazy"
    className={cn("h-10 w-10 rounded-full bg-elevated object-cover ring-1 ring-border", className)}
  />;
}
