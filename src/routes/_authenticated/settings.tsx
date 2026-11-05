import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Bell, Dumbbell, Trophy, Heart, MessageCircle, Swords, Medal, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useMyProfile } from "@/hooks/use-session";
import { USERNAME_RE } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ property: "og:title", content: "Settings — REPUNIT" }, { property: "og:description", content: "Edit your REPUNIT profile and notification preferences." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Settings — REPUNIT" }, { name: "description", content: "Edit your REPUNIT profile and notification preferences." }] }),
  component: Settings,
});

const notificationOptions = [
  { key: "lift", label: "Friend logs a lift", description: "When a mutual friend records a workout.", icon: Dumbbell },
  { key: "pr", label: "Personal records", description: "When a friend sets a new PR.", icon: Trophy },
  { key: "like", label: "Likes", description: "When someone likes your content.", icon: Heart },
  { key: "comment", label: "Comments", description: "When someone comments on your content.", icon: MessageCircle },
  { key: "challenge", label: "Challenges", description: "New call-outs and lifting challenges.", icon: Swords },
  { key: "rank", label: "Rank changes", description: "When someone takes your #1 spot and achievements unlock.", icon: Medal },
  { key: "battle", label: "Crew battles", description: "When a battle starts or ends.", icon: Swords },
  { key: "streak", label: "Streak alerts", description: "When your training streak expires.", icon: Flame },
] as const;
const defaults = { lift:true, pr:true, like:true, comment:true, challenge:true, rank:true, battle:true, streak:true };

function Settings() {
  const { user } = Route.useRouteContext();
  const { data: p } = useMyProfile(user.id);
  const qc = useQueryClient();
  const preferences = useQuery({
    queryKey: ["notification-preferences", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return { ...defaults, ...(data ?? {}) };
    },
  });
  async function setPreference(key: string, value: boolean) {
    const { error } = await (supabase as any).from("notification_preferences")
      .upsert({ user_id: user.id, [key]: value, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { toast.error("Could not save notification setting: " + error.message); return; }
    await qc.invalidateQueries({ queryKey: ["notification-preferences", user.id] });
    toast.success("Notification setting saved");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    if (!USERNAME_RE.test(username)) { toast.error("Username: 3–20 lowercase letters, numbers or _."); return; }
    const bodyweightRaw = String(f.get("bodyweight_kg") ?? "").trim();
    const bodyweight = bodyweightRaw ? Number(bodyweightRaw) : null;
    if (bodyweight !== null && (!Number.isFinite(bodyweight) || bodyweight < 25 || bodyweight > 350)) { toast.error("Bodyweight must be between 25 and 350 kg."); return; }
    const { error } = await (supabase as any).from("profiles").update({
      username, display_name: String(f.get("display_name")).slice(0, 40) || null, bio: String(f.get("bio")).slice(0, 280) || null, country_code: String(f.get("country_code") || "") || null, bodyweight_kg: bodyweight,
    }).eq("id", user.id);
    if (error) { toast.error(error.code === "23505" ? "Username taken" : error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  if (!p) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  return (
    <PageShell>
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="h-5 w-5"/></div><div><p className="eyebrow text-primary">YOUR ACCOUNT</p><h1 className="font-stat text-4xl uppercase">Settings</h1></div></div>
      <form onSubmit={save} className="mt-6 max-w-xl space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-stat text-2xl uppercase">Edit profile</h2>
        <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" name="username" defaultValue={p.username} required /></div>
        <div className="space-y-1.5"><Label htmlFor="display_name">Display name</Label><Input id="display_name" name="display_name" defaultValue={p.display_name ?? ""} maxLength={40} /></div>
        <div className="space-y-1.5"><Label htmlFor="bio">Bio</Label><Textarea id="bio" name="bio" defaultValue={p.bio ?? ""} maxLength={280} /></div>
        <div className="space-y-1.5"><Label htmlFor="bodyweight_kg">Bodyweight (kg)</Label><Input id="bodyweight_kg" name="bodyweight_kg" type="number" step="0.1" min="25" max="350" inputMode="decimal" defaultValue={(p as any).bodyweight_kg ?? ""} placeholder="e.g. 82.5" /><p className="text-xs text-muted-foreground">Used for bodyweight-class leaderboards. Leave blank if you prefer not to share it.</p></div>
        <div className="space-y-1.5"><Label htmlFor="country_code">Country</Label><select id="country_code" name="country_code" defaultValue={(p as any).country_code ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select your country</option><option value="CZ">Czechia</option><option value="SK">Slovakia</option><option value="UA">Ukraine</option><option value="PL">Poland</option><option value="DE">Germany</option><option value="AT">Austria</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="OT">Other</option></select><p className="text-xs text-muted-foreground">Used to show crew rankings in your country.</p></div>
        <Button variant="hero">Save profile</Button>
      </form>
      <section className="mt-8 max-w-xl rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-3"><Bell className="h-5 w-5 text-primary"/><div><h2 className="font-stat text-2xl uppercase">Notifications</h2><p className="text-xs text-muted-foreground">Choose what REPUNIT should tell you about.</p></div></div>
        {preferences.isLoading ? <p className="py-6 text-sm text-muted-foreground">Loading preferences…</p> : preferences.isError ? <div className="py-5"><p className="text-sm text-muted-foreground">Notification settings are not available yet. Apply database migration 0015 first.</p><Button className="mt-3" variant="line" size="sm" onClick={() => void preferences.refetch()}>Try again</Button></div> : <div className="mt-4 divide-y divide-border">
          {notificationOptions.map(({key,label,description,icon:Icon}) => <div key={key} className="flex items-center gap-3 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary"><Icon className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={Boolean((preferences.data as any)?.[key])} onCheckedChange={(value) => void setPreference(key,value)} aria-label={label}/></div>)}
        </div>}
        <div className="mt-4 rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold">Web push notifications</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">In-app alerts are active. Background push delivery still needs the secure push sender and VAPID keys configured on the server; browser permission alone cannot deliver push while REPUNIT is closed.</p></div>
      </section>
    </PageShell>
  );
}
