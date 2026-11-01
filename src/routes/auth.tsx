import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand";
import { USERNAME_RE } from "@/lib/lifts";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — REPUNIT" },
      { name: "description", content: "Sign in or create your REPUNIT account." },
      { property: "og:title", content: "Sign in — REPUNIT" },
      { property: "og:description", content: "Join your crew on REPUNIT." },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  if (!p) return "/dashboard";
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent("Check your inbox for a reset link.");
      } else if (mode === "up") {
        const username = String(f.get("username") ?? "").trim().toLowerCase();
        if (!USERNAME_RE.test(username)) throw new Error("Username: 3–20 lowercase letters, numbers or _.");
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { data: taken } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
        if (taken) throw new Error("That username is taken.");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + safePath(redirect), data: { username } },
        });
        if (error) throw error;
        setSent("Confirm your email to activate your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safePath(redirect) });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (redirect) sessionStorage.setItem("post_auth", safePath(redirect));
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error("Google sign-in failed"); return; }
    if (r.redirected) return;
    navigate({ to: safePath(redirect) });
  }

  // After an OAuth round trip back to /auth, continue once the session exists.
  if (typeof window !== "undefined") {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && window.location.pathname === "/auth") {
        const p = sessionStorage.getItem("post_auth") ?? safePath(redirect);
        sessionStorage.removeItem("post_auth");
        navigate({ to: p, replace: true });
      }
    });
  }

  return (
    <div className="grid-lines flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Wordmark className="mb-10 justify-center" />
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-bold">{mode === "up" ? "Join REPUNIT" : mode === "reset" ? "Reset password" : "Welcome back"}</h1>
          {sent ? (
            <p className="mt-4 text-sm text-muted-foreground">{sent}</p>
          ) : (
            <>
              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "up" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" name="username" required autoComplete="username" placeholder="ironjoe" />
                    <p className="text-xs text-muted-foreground">Public. Don't use your legal name.</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" required minLength={mode === "up" ? 8 : undefined} autoComplete={mode === "up" ? "new-password" : "current-password"} />
                  </div>
                )}
                <Button type="submit" variant="hero" className="h-11 w-full" disabled={busy}>
                  {mode === "up" ? "Create account" : mode === "reset" ? "Send link" : "Sign in"}
                </Button>
              </form>
              {mode !== "reset" && (
                <>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
                  <Button variant="outline" className="h-11 w-full" onClick={google}>Continue with Google</Button>
                </>
              )}
            </>
          )}
          <div className="mt-6 flex justify-between text-sm text-muted-foreground">
            {mode === "in" ? (
              <>
                <button className="hover:text-foreground" onClick={() => { setMode("up"); setSent(null); }}>Create account</button>
                <button className="hover:text-foreground" onClick={() => { setMode("reset"); setSent(null); }}>Forgot password?</button>
              </>
            ) : (
              <button className="hover:text-foreground" onClick={() => { setMode("in"); setSent(null); }}>← Back to sign in</button>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}
