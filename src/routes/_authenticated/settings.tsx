import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMyProfile } from "@/hooks/use-session";
import { USERNAME_RE } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ property: "og:title", content: "Settings — REPUNIT" }, { property: "og:description", content: "Edit your REPUNIT profile and profile settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Settings — REPUNIT" }, { name: "description", content: "Edit your REPUNIT profile and profile settings." }] }),
  component: Settings,
});

function Settings() {
  const { user } = Route.useRouteContext();
  const { data: p, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useMyProfile(user.id);
  const qc = useQueryClient();
  const [avatar, setAvatar] = useState<File | null>(null);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    if (!USERNAME_RE.test(username)) { toast.error("Username: 3–20 lowercase letters, numbers or _."); return; }
    const bodyweightRaw = String(f.get("bodyweight_kg") ?? "").trim();
    const bodyweight = bodyweightRaw ? Number(bodyweightRaw) : null;
    if (bodyweight !== null && (!Number.isFinite(bodyweight) || bodyweight < 25 || bodyweight > 350)) { toast.error("Bodyweight must be between 25 and 350 kg."); return; }
    const profileUpdate: Record<string, unknown> = {
      username, display_name: String(f.get("display_name")).slice(0, 40) || null, bio: String(f.get("bio")).slice(0, 280) || null, country_code: String(f.get("country_code") || "") || null, bodyweight_kg: bodyweight,
    };
    if (avatar) {
      if (!avatar.type.startsWith("image/") || avatar.size > 5 * 1024 * 1024) { toast.error("Choose an image under 5 MB."); return; }
      const extension = avatar.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const avatarPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(avatarPath, avatar, { cacheControl: "3600", upsert: true, contentType: avatar.type });
      if (uploadError) { toast.error("Could not upload your profile photo. Please try again."); return; }
      profileUpdate["avatar_url"] = supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl;
    }
    const { error } = await (supabase as any).from("profiles").update(profileUpdate).eq("id", user.id);
    if (error) { toast.error(error.code === "23505" ? "Username already taken." : "Could not save your profile. Check your connection and try again."); return; }
    setAvatar(null);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  if (profileLoading) return <PageShell><p className="text-muted-foreground">Loading your settings…</p></PageShell>;
  if (!p) return <PageShell><div className="py-10 text-center"><p className="font-semibold">Your settings could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p><Button className="mt-4" variant="line" onClick={() => void refetchProfile()}>Try again</Button></div></PageShell>;
  return (
    <PageShell>
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5"/></div><div><p className="eyebrow text-primary">YOUR ACCOUNT</p><h1 className="font-stat text-4xl uppercase">Settings</h1></div></div>
      {profileError && <div className="mt-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Showing your last saved settings. <button type="button" onClick={() => void refetchProfile()} className="font-semibold text-primary underline">Refresh</button></div>}
      <form onSubmit={save} className="mt-6 max-w-xl space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-stat text-2xl uppercase">Edit profile</h2>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">{p.avatar_url ? <img src={p.avatar_url} alt="Current profile" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7" />}</div>
          <div className="min-w-0 flex-1"><Label htmlFor="avatar" className="cursor-pointer">Profile photo</Label><Input id="avatar" type="file" accept="image/*" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} className="mt-1 min-h-10 text-xs" /><p className="mt-1 truncate text-[10px] text-muted-foreground">{avatar ? avatar.name : "JPG, PNG or WebP · max 5 MB"}</p></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" name="username" defaultValue={p.username} required /></div>
        <div className="space-y-1.5"><Label htmlFor="display_name">Display name</Label><Input id="display_name" name="display_name" defaultValue={p.display_name ?? ""} maxLength={40} /></div>
        <div className="space-y-1.5"><Label htmlFor="bio">Bio</Label><Textarea id="bio" name="bio" defaultValue={p.bio ?? ""} maxLength={280} /></div>
        <div className="space-y-1.5"><Label htmlFor="bodyweight_kg">Bodyweight (kg)</Label><Input id="bodyweight_kg" name="bodyweight_kg" type="number" step="0.1" min="25" max="350" inputMode="decimal" defaultValue={(p as any).bodyweight_kg ?? ""} placeholder="e.g. 82.5" /><p className="text-xs text-muted-foreground">Optional profile information. Leave blank if you prefer not to share it.</p></div>
        <div className="space-y-1.5"><Label htmlFor="country_code">Country</Label><select id="country_code" name="country_code" defaultValue={(p as any).country_code ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select your country</option><option value="CZ">Czechia</option><option value="SK">Slovakia</option><option value="UA">Ukraine</option><option value="PL">Poland</option><option value="DE">Germany</option><option value="AT">Austria</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="OT">Other</option></select><p className="text-xs text-muted-foreground">Shown as your profile location.</p></div>
        <Button variant="hero">Save profile</Button>
      </form>
    </PageShell>
  );
}
