// @ts-nocheck -- references backend features not yet set up; typed once their tables exist
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Swords, Users, LogOut, Settings, ChevronDown, UserRound, Dumbbell, Plus, Flame, Bell } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useUser } from "@/hooks/use-session";
import { InstallPrompt } from "./install-prompt";
import { FirstRunSetup } from "./first-run-setup";
import { useI18n } from "@/i18n/i18n-provider";

const nav = [
  { to: "/leaderboards" as const, label: "TOP", icon: Trophy },
  { to: "/battles" as const, label: "BATTLES", icon: Swords },
  { to: "/workouts" as const, label: "SPLIT", icon: Dumbbell },
];

export function SiteHeader() {
  const { user, ready } = useUser();
  const { t } = useI18n();
  const { data: profile } = useMyProfile(user?.id);
  const { data: progress, isError: progressError } = useQuery({
    queryKey: ["user-progression", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data: stats, error: statsError } = await (supabase as any).from("user_progress").select("current_streak").eq("user_id", user!.id).maybeSingle();
      if (statsError) throw statsError;
      return { streak: Number(stats?.current_streak ?? 0) };
    },
  });
  const { data: notifications = [], isError: notificationsError, refetch: refetchNotifications } = useQuery({
    queryKey: ["header-notifications", user?.id],
    enabled: !!user?.id,
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notifications")
        .select("id,title,body,href,kind,read_at,created_at")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  const unreadCount = notifications.filter((item: any) => !item.read_at).length;
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function openNotification(item: any) {
    if (!item.read_at) {
      const { error } = await (supabase as any).from("notifications")
        .update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user!.id);
      if (error) toast.error("Could not mark notification as read.");
    }
    await qc.invalidateQueries({ queryKey: ["header-notifications", user?.id] });
    navigate({ to: (item.href || "/leaderboards") as any });
  }
  async function signOut() {
    await qc.cancelQueries();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Could not sign out. Please try again.");
      return;
    }
    qc.clear();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur-2xl md:px-6">
      <div className="flex items-center gap-3"><div className="md:hidden"><Wordmark /></div><div className="hidden md:block"><span className="eyebrow">STRENGTH IS SOCIAL</span><p className="text-xs text-muted-foreground">Your training network</p></div></div>
      <div className="flex items-center gap-3">
        {user && <details className="group relative">
          <summary aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"} className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </summary>
          <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-sm font-bold">Notifications</p><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{unreadCount} new</span></div>
            {notificationsError ? <div className="p-4 text-sm text-muted-foreground"><p>Notifications are temporarily unavailable.</p><button type="button" onClick={() => void refetchNotifications()} className="mt-2 font-semibold text-primary underline">Retry</button></div> : notifications.length ? <div className="max-h-[min(65vh,28rem)] overflow-y-auto">{notifications.map((item: any) => <button key={item.id} type="button" onClick={() => void openNotification(item)} className="flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left transition hover:bg-elevated"><span className={item.read_at ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"} /><span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.body}</span><span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></span></button>)}</div> : <p className="p-5 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          </div>
        </details>}
                <Link to="/records/new" className="hidden rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary-foreground transition hover:brightness-110 sm:inline-flex"><Dumbbell className="mr-2 h-3.5 w-3.5"/>Submit a lift</Link>

        {ready && !user && <Button asChild size="sm" variant="hero"><Link to="/auth">{t("signIn")}</Link></Button>}
        {user && <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card p-1 pr-2 transition hover:border-primary/50 [&::-webkit-details-marker]:hidden">
            <Avatar className="h-9 w-9"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback className="bg-elevated text-xs font-bold">{(profile?.username ?? "R").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/40">
            <div className="border-b border-border px-3 py-3"><p className="font-semibold">{profile?.display_name || profile?.username || "Lifter"}</p><p className="text-xs text-muted-foreground">@{profile?.username ?? "member"}</p><div className="mt-3">{progressError && !progress ? <p className="text-xs text-muted-foreground">Streak unavailable.</p> : progress ? <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Flame className="h-4 w-4 text-primary" /><span>{progress.streak} day streak</span></div> : <p className="text-xs text-muted-foreground">Loading streak…</p>}</div></div>
            {profile && <Link to="/u/$username" params={{ username: profile.username }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-elevated"><UserRound className="h-4 w-4" /> {t("myProfile")}</Link>}
            <Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-elevated"><Settings className="h-4 w-4" /> {t("settings")}</Link>
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-elevated hover:text-foreground"><LogOut className="h-4 w-4" /> {t("logOut")}</button>
          </div>
        </details>}
      </div>
    </header>
  );
}

export function DesktopSidebar() {
  const { user } = useUser();
  const { t } = useI18n();
  const { data: profile } = useMyProfile(user?.id);
  if (!user) return null;
  return <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-[220px] shrink-0 flex-col border-r border-border/70 bg-background/70 px-3 py-6 lg:flex">
    <div className="px-3 pb-7"><Wordmark /></div>
    <p className="px-3 pb-3 text-[9px] font-black uppercase tracking-[.22em] text-muted-foreground">Workspace</p>
    <nav className="space-y-1">
      {nav.map(({to,label,icon:Icon})=><Link key={to} to={to} className="group flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-elevated hover:text-foreground" activeProps={{className:"!bg-primary/10 !text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]"}}><Icon className="h-[18px] w-[18px] transition group-hover:scale-110"/>{label==="TOP"?t("top"):label==="BATTLES"?t("battles"):t("split")}</Link>)}
      <Link to="/crews" className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted-foreground transition hover:bg-elevated hover:text-foreground"><Users className="h-[18px] w-[18px]"/>{t("crews")}</Link>
      <Link to="/challenges" className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted-foreground transition hover:bg-elevated hover:text-foreground"><Swords className="h-[18px] w-[18px]"/>Challenges</Link>
      <Link to="/people" className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted-foreground transition hover:bg-elevated hover:text-foreground"><Users className="h-[18px] w-[18px]"/>{t("findLifters")}</Link>
    </nav>
    <div className="mt-auto space-y-2">
      <Link to="/records/new" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-[0_8px_30px_-12px_hsl(var(--primary)/.7)] transition hover:-translate-y-0.5 hover:brightness-110"><Dumbbell className="h-4 w-4"/> {t("submitLift")}</Link>
      {profile&&<Link to="/u/$username" params={{username:profile.username}} className="mt-3 flex items-center gap-3 rounded-xl border border-border p-2 transition hover:border-primary/40 hover:bg-elevated"><Avatar className="h-9 w-9"><AvatarImage src={profile.avatar_url??undefined}/><AvatarFallback>{profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0"><b className="block truncate text-xs">{profile.display_name||profile.username}</b><span className="text-[10px] text-muted-foreground">View profile</span></span></Link>}
    </div>
  </aside>;
}

export function MobileNav() {
  const { user } = useUser();
  const { t } = useI18n();
  const { data: profile } = useMyProfile(user?.id);
  const item = "relative flex h-full min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-black uppercase tracking-[0.04em] text-muted-foreground transition active:scale-95";
  const active = { className: "!text-primary" };
  return <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_35px_-24px_rgba(0,0,0,.9)] backdrop-blur-2xl lg:hidden">
    <div className="mx-auto flex h-[76px] max-w-xl items-center justify-between gap-1 px-2">
      <Link to="/leaderboards" className={item} activeProps={active}><Trophy className="h-5 w-5"/>{t("top")}</Link>
      <Link to="/battles" className={item} activeProps={active}><Swords className="h-5 w-5"/>{t("battles")}</Link>
      <Link to="/records/new" aria-label="Log a lift" className="relative -mt-5 flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_hsl(var(--primary)/.8)] transition hover:brightness-110 active:scale-95">
        <Plus className="h-7 w-7"/><span className="text-[9px] font-black uppercase tracking-wider">{t("log")}</span>
      </Link>
      <Link to="/workouts" className={item} activeProps={active}><Dumbbell className="h-5 w-5"/>{t("split")}</Link>
      {profile ? <Link to="/u/$username" params={{username:profile.username}} className={item} activeProps={active}><Avatar className="h-5 w-5"><AvatarImage src={profile.avatar_url??undefined}/><AvatarFallback className="text-[8px]">{profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>{t("profile")}</Link> : user ? <Link to="/settings" className={item} activeProps={active}><UserRound className="h-5 w-5"/>{t("profile")}</Link> : <Link to="/auth" className={item} activeProps={active}><UserRound className="h-5 w-5"/>PROFILE</Link>}
    </div>
  </nav>;
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0"><SiteHeader/><div className="mx-auto flex max-w-[1600px]"><DesktopSidebar/><main className="min-w-0 flex-1 px-4 py-7 md:px-6 md:py-10 lg:px-9"><div className="mx-auto w-full max-w-7xl">{children}</div></main></div><MobileNav/><InstallPrompt/><FirstRunSetup/></div>;
}
export function SiteFooter() { const { t } = useI18n(); return <footer className="border-t border-border py-10 pb-28 md:pb-10"><div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-6"><Wordmark/><nav className="flex flex-wrap gap-5 text-sm text-muted-foreground"><Link to="/leaderboards" className="hover:text-foreground">{t("top")}</Link><Link to="/terms" className="hover:text-foreground">Terms</Link><Link to="/privacy" className="hover:text-foreground">Privacy</Link></nav><p className="eyebrow">Strength is social.</p></div></footer>; }
