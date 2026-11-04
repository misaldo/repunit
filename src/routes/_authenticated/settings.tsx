import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMyProfile } from "@/hooks/use-session";
import { USERNAME_RE } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ property: "og:title", content: "Settings — REPUNIT" }, { property: "og:description", content: "Edit your REPUNIT profile." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Settings — REPUNIT" }, { name: "description", content: "Edit your REPUNIT profile." }] }),
  component: Settings,
});

function Settings() {
  const { user } = Route.useRouteContext();
  const { data: p } = useMyProfile(user.id);
  const qc = useQueryClient();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    if (!USERNAME_RE.test(username)) { toast.error("Username: 3–20 lowercase letters, numbers or _."); return; }
    const { error } = await (supabase as any).from("profiles").update({
      username, display_name: String(f.get("display_name")).slice(0, 40) || null, bio: String(f.get("bio")).slice(0, 280) || null, country_code: String(f.get("country_code") || "") || null,
    }).eq("id", user.id);
    if (error) { toast.error(error.code === "23505" ? "Username taken" : error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  if (!p) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  return (
    <PageShell>
      <h1 className="text-3xl font-bold">Edit profile</h1>
      <form onSubmit={save} className="mt-6 max-w-md space-y-4">
        <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" name="username" defaultValue={p.username} required /></div>
        <div className="space-y-1.5"><Label htmlFor="display_name">Display name</Label><Input id="display_name" name="display_name" defaultValue={p.display_name ?? ""} maxLength={40} /></div>
        <div className="space-y-1.5"><Label htmlFor="bio">Bio</Label><Textarea id="bio" name="bio" defaultValue={p.bio ?? ""} maxLength={280} /></div>
        <div className="space-y-1.5"><Label htmlFor="country_code">Country</Label><select id="country_code" name="country_code" defaultValue={(p as any).country_code ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select your country</option><option value="CZ">Czechia</option><option value="SK">Slovakia</option><option value="UA">Ukraine</option><option value="PL">Poland</option><option value="DE">Germany</option><option value="AT">Austria</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="OT">Other</option></select><p className="text-xs text-muted-foreground">Used to show crew rankings in your country.</p></div>
        <Button variant="hero">Save</Button>
      </form>
    </PageShell>
  );
}
