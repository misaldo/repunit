import { BadgeCheck, Clock, AlertTriangle, XCircle, Cpu } from "lucide-react";
import { STATUS_META, type LiftStatus } from "@/lib/lifts";
import { cn } from "@/lib/utils";

const TONE = {
  verified: "text-success border-success/40 bg-success/10",
  pending: "text-muted-foreground border-border bg-muted",
  warn: "text-warning border-warning/40 bg-warning/10",
  bad: "text-destructive border-destructive/40 bg-destructive/10",
  ai: "text-foreground border-foreground/20 bg-elevated",
};
const ICON = { verified: BadgeCheck, pending: Clock, warn: AlertTriangle, bad: XCircle, ai: Cpu };

export function StatusBadge({ status, className }: { status: LiftStatus; className?: string }) {
  const m = STATUS_META[status];
  const Icon = ICON[m.tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", TONE[m.tone], className)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
