import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, Trophy, Swords, Users, LogOut, Settings, Crown, ChevronDown, UserRound, Dumbbell } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useUser } from "@/hooks/use-session";
import { InstallPrompt } from "./install-prompt";
import { ProgressionCard } from "./progression-card";

const nav = [
  { to: "/dashboard" as const, label: "Home", icon: Home },
  { to: "/leaderboards" as const, label: "Ranks", icon: Trophy },
  { to: "/battles" as const, label: "Battles", icon: Swords },
  { to: "/crews" as const, label: "Crews", icon: Users },
];

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
    <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur-2xl md:px-6">
      <div className="flex items-center gap-3"><div className="md:hidden"><Wordmark /></div><div className="hidden md:block"><span className="eyebrow">STRENGTH IS SOCIAL</span><p className="text-xs text-muted-foreground">Your training network</p></div></div>
      <div className="flex items-center gap-3">
        <Link to="/records/new" className="hidden rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary-foreground transition hover:brightness-110 sm:inline-flex"><Dumbbell className="mr-2 h-3.5 w-3.5"/>Submit a lift</Link>
        <Link to="/pricing" className="hidden rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[10px] font-extrabold tracking-[0.14em] text-primary transition hover:bg-primary/20 sm:inline-flex"><Crown className="mr-2 h-3.5 w-3.5" /> GO PRO</Link>
        {ready && !user && <Button asChild size="sm" variant="hero"><Link to="/auth">Sign in</Link></Button>}
        {user && <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card p-1 pr-2 transition hover:border-primary/50 [&::-webkit-details-marker]:hidden">
            <Avatar className="h-9 w-9"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback className="bg-elevated text-xs font-bold">{(profile?.username ?? "R").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/40">
            <div className="border-b border-border px-3 py-3"><p className="font-semibold">{profile?.display_name || profile?.username || "Lifter"}</p><p className="text-xs text-muted-foreground">@{profile?.username ?? "member"}</p><div className="mt-3"><ProgressionCard xp={progress?.xp ?? 0} streak={progress?.streak ?? 0} longestStreak={progress?.longest ?? 0} achievements={progress?.achievements ?? []} compact /></div></div>
            {profile && <Link to="/u/$username" params={{ username: profile.username }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-elevated"><UserRound className="h-4 w-4" /> My Profile</Link>}
            <Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-elevated"><Settings className="h-4 w-4" /> Settings</Link>
            <Link to="/pricing" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-primary transition hover:bg-elevated"><Crown className="h-4 w-4" /> Upgrade to PRO</Link>
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-elevated hover:text-foreground"><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </details>}
      </div>
    </header>
  );
}

export function DesktopSidebar() {
  const { user } = useUser();
  const { data: profile } = useMyProfile(user?.id);
  if (!user) return null;
  return <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-[220px] shrink-0 flex-col border-r border-border/70 bg-background/70 px-3 py-6 lg:flex">
    <div className="px-3 pb-7"><Wordmark /></div>
    <p className="px-3 pb-3 text-[9px] font-black uppercase tracking-[.22em] text-muted-foreground">Workspace</p>
    <nav className="space-y-1">
      {nav.map(({to,label,icon:Icon})=><Link key={to} to={to} className="group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-elevated hover:text-foreground" activeProps={{className:"!bg-primary/10 !text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]"}}><Icon className="h-[18px] w-[18px] transition group-hover:scale-110"/>{label}{label==="Battles"&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]"/>}</Link>)}
    </nav>
    <div className="mt-auto space-y-2">
      <Link to="/workouts" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-elevated hover:text-foreground"><Dumbbell className="h-4 w-4"/> Training split</Link>
      <Link to="/records/new" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-[0_8px_30px_-12px_hsl(var(--primary)/.7)] transition hover:-translate-y-0.5 hover:brightness-110"><Dumbbell className="h-4 w-4"/> Submit a lift</Link>
      {profile&&<Link to="/u/$username" params={{username:profile.username}} className="mt-3 flex items-center gap-3 rounded-xl border border-border p-2 transition hover:border-primary/40 hover:bg-elevated"><Avatar className="h-9 w-9"><AvatarImage src={profile.avatar_url??undefined}/><AvatarFallback>{profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0"><b className="block truncate text-xs">{profile.display_name||profile.username}</b><span className="text-[10px] text-muted-foreground">View profile</span></span></Link>}
    </div>
  </aside>;
}

export function MobileNav() {
  const { user } = useUser(); const { data: profile } = useMyProfile(user?.id);
  if (!user) return null;
  const item = "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-all duration-200 active:scale-90";
  const active = { className: "!text-primary" };
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_35px_-24px_rgba(0,0,0,.9)] backdrop-blur-2xl lg:hidden"><div className="mx-auto flex max-w-xl items-end px-1">
    <Link to="/dashboard" className={item} activeProps={active}><Home className="h-5 w-5"/>Home</Link>
    <Link to="/leaderboards" className={item} activeProps={active}><Trophy className="h-5 w-5"/>Ranks</Link>
    <Link to="/battles" className="relative -mt-5 flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[9px] font-black uppercase tracking-[.08em] text-primary transition-transform active:scale-90" activeProps={{className:"text-primary"}}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/.5)]"><Swords className="h-6 w-6"/></span>Battles
    </Link>
    <Link to="/crews" className={item} activeProps={active}><Users className="h-5 w-5"/>Crews</Link>
    {profile?<Link to="/u/$username" params={{username:profile.username}} className={item} activeProps={active}><Avatar className="h-5 w-5"><AvatarImage src={profile.avatar_url??undefined}/><AvatarFallback className="text-[8px]">{profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>Profile</Link>:<Link to="/settings" className={item} activeProps={active}><UserRound className="h-5 w-5"/>Profile</Link>}
  </div></nav>;
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen pb-24 lg:pb-0"><SiteHeader/><div className="mx-auto flex max-w-[1600px]"><DesktopSidebar/><main className="min-w-0 flex-1 px-4 py-7 md:px-6 md:py-10 lg:px-9"><div className="mx-auto w-full max-w-7xl">{children}</div></main></div><MobileNav/><InstallPrompt/></div>;
}
export function SiteFooter() { return <footer className="border-t border-border py-10 pb-28 md:pb-10"><div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-6"><Wordmark/><nav className="flex flex-wrap gap-5 text-sm text-muted-foreground"><Link to="/leaderboards" className="hover:text-foreground">Ranks</Link><Link to="/pricing" className="hover:text-foreground">Pricing</Link><Link to="/terms" className="hover:text-foreground">Terms</Link><Link to="/privacy" className="hover:text-foreground">Privacy</Link></nav><p className="eyebrow">Strength is social.</p></div></footer>; }
