import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** REPUNIT's animated "Repulse" insignia: a cut monogram inside a kinetic strength orbit. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("repunit-mark h-8 w-8 shrink-0", className)} role="img" aria-label="REPUNIT emblem">
      <defs>
        <linearGradient id="repunit-mark-fill" x1="7" y1="5" x2="41" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff5963" /><stop offset="1" stopColor="#b81725" />
        </linearGradient>
      </defs>
      <path className="mark-shell" d="M24 2.5 43.5 13.75v20.5L24 45.5 4.5 34.25v-20.5L24 2.5Z" fill="#101010" stroke="url(#repunit-mark-fill)" strokeWidth="1.6"/>
      <path className="mark-orbit" d="M7.5 24c0-9.1 7.4-16.5 16.5-16.5S40.5 14.9 40.5 24 33.1 40.5 24 40.5" fill="none" stroke="#ff303c" strokeWidth="1.25" strokeLinecap="round" strokeDasharray="3 4"/>
      <path d="M16 13h11.1a7.1 7.1 0 0 1 2.5 13.75L35 35h-7.1l-4.6-7.1h-1.5V35H16V13Zm5.8 5.5v4h5.1a2 2 0 1 0 0-4h-5.1Z" fill="url(#repunit-mark-fill)"/>
      <path className="mark-flare" d="m36.5 8 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" fill="#fff" />
    </svg>
  );
}
export function Wordmark({ className }: { className?: string }) {
  return <Link to="/" className={cn("group flex items-center gap-2.5", className)} aria-label="REPUNIT home"><Mark className="h-9 w-9 transition-transform duration-300 group-hover:scale-110" /><span className="font-heading text-lg font-bold tracking-[0.18em]">REP<span className="text-primary">UNIT</span></span></Link>;
}
