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
  head: () => ({ meta: [{ title: "Settings — REPUNIT" }, { name: "description", content: "Edit your REPUNIT profile." }] }),
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
    const { error } = await supabase.from("profiles").update({
      username, display_name: String(f.get("display_name")).slice(0, 40) || null, bio: String(f.get("bio")).slice(0, 280) || null,
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
        <Button variant="hero">Save</Button>
      </form>
    </PageShell>
  );
}
