import { cn } from "@/lib/utils";

export function AvatarChip({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  if (url) return <img src={url} alt="" className={cn("h-10 w-10 rounded-full object-cover", className)} />;
  return (
    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-elevated font-heading text-sm font-bold uppercase", className)}>
      {name.slice(0, 2)}
    </div>
  );
}
