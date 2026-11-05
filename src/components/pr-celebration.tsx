import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

const pieces = Array.from({ length: 48 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 9) * 0.07}s`,
  duration: `${2.1 + (index % 5) * 0.24}s`,
  rotate: `${index * 43}deg`,
  size: `${6 + (index % 4) * 2}px`,
  color: ["hsl(var(--primary))", "#fbbf24", "#ffffff", "#fb7185"][index % 4],
}));

export function PrCelebration() {
  const { user } = useUser();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void (supabase as any).rpc("repunit_check_my_streak_loss").then(({ error }: { error: unknown }) => {
      if (error) console.warn("REPUNIT streak check unavailable", error);
    });
  }, [user?.id]);

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
        if ((payload.new as { kind?: string }).kind !== "pr") return;
        setActive(true);
        toast.success("NEW PERSONAL RECORD!", { description: "The work paid off. +50 XP added to your profile." });
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => setActive(false), 2800);
      })
      .subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  if (!active) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((piece, index) => <span key={index} className="pr-confetti-piece" style={{
        left: piece.left,
        animationDelay: piece.delay,
        animationDuration: piece.duration,
        transform: `rotate(${piece.rotate})`,
        width: piece.size,
        height: `calc(${piece.size} * 1.7)`,
        background: piece.color,
      } as CSSProperties}/>)}
    </div>
  );
}
