import { useEffect, useState } from "react";
import { Award, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ACHIEVEMENTS } from "@/lib/progression";

type Unlock = { key: string; title: string; description: string; icon: string; category: string };

export function AchievementUnlockBanner() {
  const [unlock, setUnlock] = useState<Unlock | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let activeUserId: string | null = null;
    const connect = (userId: string | null) => {
      if (userId === activeUserId) return;
      activeUserId = userId;
      if (channel) { void supabase.removeChannel(channel); channel = undefined; }
      if (!userId || !alive) return;
      channel = supabase.channel(`achievement-unlocks-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_achievements", filter: `user_id=eq.${userId}` }, (payload) => {
          const key = String((payload.new as { achievement_key?: string }).achievement_key ?? "");
          const item = ACHIEVEMENTS[key];
          if (!item || !alive) return;
          setUnlock({ key, ...item });
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setUnlock(null), 8500);
        }).subscribe();
    };
    supabase.auth.getSession().then(({ data }) => connect(data.session?.user.id ?? null));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => connect(session?.user.id ?? null));
    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
  if (!unlock) return null;
  return <>
    <style>{`
      @keyframes rep-achievement-enter { 0% { opacity:0; transform:translate(-50%,-24px) scale(.92) } 65% { opacity:1; transform:translate(-50%,5px) scale(1.015) } 100% { opacity:1; transform:translate(-50%,0) scale(1) } }
      @keyframes rep-achievement-glow { 0%,100% { box-shadow:0 12px 50px rgba(255,35,55,.16),0 0 0 1px rgba(255,55,70,.18) } 50% { box-shadow:0 12px 65px rgba(255,35,55,.34),0 0 34px rgba(255,55,70,.18) } }
      @keyframes rep-achievement-icon { 0% { transform:rotate(-18deg) scale(.4) } 70% { transform:rotate(8deg) scale(1.14) } 100% { transform:rotate(0) scale(1) } }
      @keyframes rep-achievement-particle { 0% { opacity:0; transform:translateY(12px) scale(.4) } 35% { opacity:1 } 100% { opacity:0; transform:translateY(-34px) scale(1) } }
      @keyframes rep-achievement-progress { from { transform:scaleX(1) } to { transform:scaleX(0) } }
      .rep-achievement-banner { animation:rep-achievement-enter .55s cubic-bezier(.2,.85,.25,1) both,rep-achievement-glow 2.8s ease-in-out .55s infinite }
      .rep-achievement-icon { animation:rep-achievement-icon .65s cubic-bezier(.2,.85,.25,1) both }
      .rep-achievement-particle { animation:rep-achievement-particle 1.8s ease-out infinite }
      @media(prefers-reduced-motion:reduce) { .rep-achievement-banner,.rep-achievement-icon,.rep-achievement-particle { animation:none !important } }
    `}</style>
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-3" aria-live="assertive" aria-atomic="true">
      <section className="rep-achievement-banner pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-primary/50 bg-[#111114]/95 p-4 text-white backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />
        <div className="rep-achievement-particle absolute right-16 top-2 text-primary/70">✦</div><div className="rep-achievement-particle absolute right-9 top-8 text-white/70" style={{animationDelay:".4s"}}>✧</div><div className="rep-achievement-particle absolute left-20 top-3 text-primary/70" style={{animationDelay:".8s"}}>✦</div>
        <button type="button" onClick={() => setUnlock(null)} aria-label="Dismiss achievement banner" className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="relative flex items-center gap-4">
          <div className="rep-achievement-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/50 bg-primary/15 text-4xl shadow-[0_0_28px_rgba(255,45,60,.2)]">{unlock.icon}</div>
          <div className="min-w-0 flex-1 pr-5"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.2em] text-primary"><Award className="h-3.5 w-3.5" /> Achievement unlocked</div><h2 className="truncate text-lg font-black tracking-tight">{unlock.title}</h2><p className="mt-0.5 text-xs leading-5 text-white/65">{unlock.description}</p><p className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary"><Sparkles className="h-3 w-3" /> +10 bonus XP</p></div>
        </div>
        <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left animate-[rep-achievement-progress_8.5s_linear_forwards] rounded-full bg-primary" /></div>
      </section>
    </div>
  </>;
}
