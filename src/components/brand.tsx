import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Original REPUNIT plate-mark: a compact R cut into a loaded barbell silhouette. */
export function Mark({ className }: { className?: string }) {
  return <svg viewBox="0 0 40 40" className={cn("h-8 w-8",className)} role="img" aria-label="REPUNIT mark">
    <rect x="1" y="1" width="38" height="38" rx="11" className="fill-primary"/>
    <path d="M9 11h13a7 7 0 0 1 2.1 13.7L30 31h-6.2l-5.1-6.3H15V31H9V11Zm6 5v4h7a2 2 0 1 0 0-4h-7Z" className="fill-primary-foreground"/>
    <path d="M6 7h28" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45"/>
  </svg>;
}
export function Wordmark({ className }: { className?: string }) {
 return <Link to="/" className={cn("flex items-center gap-2.5",className)} aria-label="REPUNIT home"><Mark/><span className="font-heading text-lg font-bold tracking-[0.18em]">REP<span className="text-primary">UNIT</span></span></Link>;
}