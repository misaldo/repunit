import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** REPUNIT mark: a stacked plate "R" — two bars and a notch. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path d="M9 8h9.5a5.5 5.5 0 0 1 1.8 10.7L24 24h-4.6l-3.2-4.8H13V24H9V8Zm4 3.6v4.1h5.2a2 2 0 0 0 0-4.1H13Z" className="fill-primary-foreground" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2", className)} aria-label="REPUNIT home">
      <Mark />
      <span className="font-heading text-lg font-bold tracking-[0.18em]">
        REP<span className="text-primary">UNIT</span>
      </span>
    </Link>
  );
}
