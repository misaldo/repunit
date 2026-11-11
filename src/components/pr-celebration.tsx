import { useEffect, useState, type CSSProperties } from "react";
import { useUser } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { getPrRankMessage } from "@/lib/pr-celebration";

const pieces = Array.from({ length: 48 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 7) * 0.025}s`,
  duration: `${1.05 + (index % 5) * 0.12}s`,
  rotate: `${index * 43}deg`,
  size: `${6 + (index % 4) * 2}px`,
  color: ["hsl(var(--primary))", "#fbbf24", "#ffffff", "#fb7185"][index % 4],
}));

type Celebration = { previousRank: number | null; newRank: number | null };

export function PrCelebration() {
  const { user } = useUser();
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`repunit-pr-celebrations-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const event = payload.new as {
          kind?: string;
          previous_rank?: number | null;
          new_rank?: number | null;
        };
        if (event.kind !== "pr") return;
        if (timeout) clearTimeout(timeout);
        setCelebration({
          previousRank: event.previous_rank == null ? null : Number(event.previous_rank),
          newRank: event.new_rank == null ? null : Number(event.new_rank),
        });
        timeout = setTimeout(() => setCelebration(null), 1750);
      })
      .subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  if (!celebration) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4" aria-live="assertive">
      {pieces.map((piece, index) => <span key={index} aria-hidden="true" className="pr-confetti-piece" style={{
        left: piece.left,
        animationDelay: piece.delay,
        animationDuration: piece.duration,
        transform: `rotate(${piece.rotate})`,
        width: piece.size,
        height: `calc(${piece.size} * 1.7)`,
        background: piece.color,
      } as CSSProperties} />)}
      <section role="dialog" aria-label="Personal record celebration" className="pr-celebration-panel pointer-events-auto relative w-full max-w-sm rounded-3xl border border-primary/50 bg-card px-6 py-7 text-center shadow-[0_24px_90px_-24px_rgba(255,48,60,.65)]">
        <button type="button" onClick={() => setCelebration(null)} className="absolute right-3 top-3 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">Skip</button>
        <p className="eyebrow text-primary">NEW PERSONAL RECORD</p>
        <p className="font-stat mt-3 text-6xl text-foreground">+50 XP</p>
        <p className="mt-3 text-sm font-semibold text-foreground">{getPrRankMessage(celebration.previousRank, celebration.newRank)}</p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Keep pushing.</p>
      </section>
    </div>
  );
}
