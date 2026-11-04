import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Users, LogOut, Rss, Dumbbell, Settings, Crown, ChevronDown, Flame, UserRound } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useUser } from "@/hooks/use-session";
import { InstallPrompt } from "./install-prompt";
import { ProgressionCard } from "./progression-card";

export function SiteHeader() {
  const { user, ready } = useUser();
  const { data: profile } = useMyProfile(user?.id);
  const { data: progress } = useQuery({
    queryKey: ["user-progression", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: stats }, { data: badges }] = await Promise.all([
        (supabase as any).from("user_progress").select("xp,current_streak,longest_streak").eq("user_id", user!.id).maybeSingle(),
        (supabase as any).from("user_achievements").select("achievement_key").eq("user_id", user!.id),
      ]);
      return { xp: Number(stats?.xp ?? 0), streak: stats?.current_streak ?? 0, longest: stats?.longest_streak ?? 0, achievements: (badges ?? []).map((x: {achievement_key:string}) => x.achievement_key) };
    },
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 md:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-[13px] font-semibold text-muted-foreground lg:flex">
          {user && <Link to="/feed" className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>Feed</Link>}
          <Link to="/leaderboards" className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>Top</Link>
          {user && <Link to="/workouts" className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>Workouts</Link>}
          {user && <Link to="/crews" className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>Crews</Link>}
          <Link to="/pricing" className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>Pricing</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/pricing" className="hidden rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[11px] font-extrabold tracking-[0.14em] text-primary transition hover:bg-primary/20 sm:inline-flex"><Crown className="mr-2 h-3.5 w-3.5" /> GO PRO</Link>
          {ready && !user && <Button asChild size="sm" variant="hero"><Link to="/auth">Sign in</Link></Button>}
          {user && <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card p-1 pr-2 transition hover:border-primary/50 [&::-webkit-details-marker]:hidden">
              <Avatar className="h-9 w-9"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback className="bg-elevated text-xs font-bold">{(profile?.username ?? "R").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/40">
              <div className="border-b border-border px-3 py-3">
                <p className="font-semibold">{profile?.display_name || profile?.username || "Lifter"}</p><p className="text-xs text-muted-foreground">@{profile?.username ?? "member"}</p>
                <div className="mt-3"><ProgressionCard xp={progress?.xp ?? 0} streak={progress?.streak ?? 0} longestStreak={progress?.longest ?? 0} achievements={progress?.achievements ?? []} compact /></div>
              </div>
              {profile && <Link to="/u/$username" params={{ username: profile.username }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-elevated"><UserRound className="h-4 w-4" /> My Profile</Link>}
              <Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-elevated"><Settings className="h-4 w-4" /> Settings</Link>
              <Link to="/pricing" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-primary hover:bg-elevated"><Crown className="h-4 w-4" /> Upgrade to PRO</Link>
              <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"><LogOut className="h-4 w-4" /> Log out</button>
            </div>
          </details>}
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { user } = useUser(); const { data: profile } = useMyProfile(user?.id);
  if (!user) return null;
  const item = "flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors";
  const active = { className: "text-primary" };
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl"><div className="mx-auto flex max-w-xl items-center px-1">
    <Link to="/feed" className={item} activeProps={active}><Rss className="h-5 w-5" />Feed</Link>
    <Link to="/workouts" className={item} activeProps={active}><Dumbbell className="h-5 w-5" />Workouts</Link>
    <Link to="/crews" className={item} activeProps={active}><Users className="h-5 w-5" />Crews</Link>
    <Link to="/leaderboards" className={item} activeProps={active}><Trophy className="h-5 w-5" />Top</Link>
    {profile ? <Link to="/u/$username" params={{ username: profile.username }} className={item} activeProps={active}><Avatar className="h-5 w-5"><AvatarImage src={profile.avatar_url ?? undefined}/><AvatarFallback className="text-[8px]">{profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>Profile</Link> : <Link to="/settings" className={item} activeProps={active}><UserRound className="h-5 w-5"/>Profile</Link>}
  </div></nav>;
}
export function PageShell({ children }: { children: ReactNode }) { return <div className="min-h-screen pb-24 md:pb-0"><SiteHeader /><main className="mx-auto max-w-7xl px-4 py-7 md:px-6 md:py-10">{children}</main><MobileNav /><InstallPrompt /></div>; }
export function SiteFooter() { return <footer className="border-t border-border py-10 pb-28 md:pb-10"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-6"><Wordmark /><nav className="flex flex-wrap gap-5 text-sm text-muted-foreground"><Link to="/leaderboards" className="hover:text-foreground">Top</Link><Link to="/pricing" className="hover:text-foreground">Pricing</Link><Link to="/terms" className="hover:text-foreground">Terms</Link><Link to="/privacy" className="hover:text-foreground">Privacy</Link></nav><p className="eyebrow">Strength is social.</p></div></footer>; }
