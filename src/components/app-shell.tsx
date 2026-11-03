
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Home, Trophy, Plus, Users, User as UserIcon, LogOut, Rss } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useUser } from "@/hooks/use-session";

export function SiteHeader() {
  const { user, ready } = useUser();
  const { data: profile } = useMyProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Wordmark />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {user && (
            <Link to="/feed" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Feed
            </Link>
          )}
          <Link to="/leaderboards" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
            Leaderboards
          </Link>
          <Link to="/pricing" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
            Pricing
          </Link>
          {user && (
            <Link to="/crews" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Crews
            </Link>
          )}
          {user && (
            <Link to="/dashboard" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {ready && !user && (
            <Button asChild size="sm" variant="hero">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
          {user && (
            <>
              {profile && (
                <Link
                  to="/u/$username"
                  params={{ username: profile.username }}
                  className="hidden text-sm font-medium md:block"
                >
                  @{profile.username}
                </Link>
              )}
              <Button size="icon" variant="ghost" onClick={signOut} aria-label="Sign out">
                <LogOut />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { user } = useUser();
  const { data: profile } = useMyProfile(user?.id);

  if (!user) return null;

  const item =
    "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
  const active = { className: "text-foreground" };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="flex items-end">
        <Link to="/feed" className={item} activeProps={active}>
          <Rss className="h-5 w-5" />
          Feed
        </Link>
        <Link to="/leaderboards" className={item} activeProps={active}>
          <Trophy className="h-5 w-5" />
          Ranks
        </Link>
        <Link to="/records/new" className="-mt-5 flex flex-1 justify-center" aria-label="Submit a lift">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-red shadow-glow">
            <Plus className="h-6 w-6 text-primary-foreground" />
          </span>
        </Link>
        <Link to="/crews" className={item} activeProps={active}>
          <Users className="h-5 w-5" />
          Crews
        </Link>
        {profile ? (
          <Link to="/u/$username" params={{ username: profile.username }} className={item} activeProps={active}>
            <UserIcon className="h-5 w-5" />
            Me
          </Link>
        ) : (
          <Link to="/settings" className={item} activeProps={active}>
            <UserIcon className="h-5 w-5" />
            Me
          </Link>
        )}
      </div>
    </nav>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
      <MobileNav />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-10 pb-28 md:pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between">
        <Wordmark />
        <nav className="flex flex-wrap gap-5 text-sm text-muted-foreground">
          <Link to="/leaderboards" className="hover:text-foreground">Leaderboards</Link>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        </nav>
        <p className="eyebrow">Strength is social.</p>
      </div>
    </footer>
  );
}
