import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
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
const defaults = { lift:true, pr:true, like:true, comment:true, challenge:true, rank:true, battle:true, streak:true, push_enabled:false };

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) output[index] = raw.charCodeAt(index);
  return output;
}

function Settings() {
  const { user } = Route.useRouteContext();
  const { data: p } = useMyProfile(user.id);
  const qc = useQueryClient();
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushSubscription, setPushSubscription] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window && Boolean(import.meta.env["VITE_VAPID_PUBLIC_KEY"]);
    setPushSupported(supported);
    if ("Notification" in window) setPushPermission(Notification.permission);
    if (supported) {
      void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setPushSubscription(Boolean(subscription)))
        .catch(() => setPushSubscription(false));
    }
  }, []);
  const subscription = useQuery({
    queryKey: ["subscription", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("user_subscriptions")
        .select("status").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isPro = ["active", "trialing"].includes(subscription.data?.status ?? "");

  const preferences = useQuery({
    queryKey: ["notification-preferences", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return { ...defaults, ...(data ?? {}) };
    },
  });
  async function setPreference(key: string, value: boolean, showToast = true): Promise<boolean> {
    const { error } = await (supabase as any).from("notification_preferences")
      .upsert({ user_id: user.id, [key]: value, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { toast.error("Could not save notification setting: " + error.message); return false; }
    await qc.invalidateQueries({ queryKey: ["notification-preferences", user.id] });
    if (showToast) toast.success("Notification setting saved");
    return true;
  }
  async function toggleWebPush() {
    if (!pushSupported) { toast.error("Web push is not supported or VAPID is not configured."); return; }
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const { error } = await (supabase as any).from("push_subscriptions").delete()
          .eq("user_id", user.id).eq("endpoint", existing.endpoint);
        if (error) throw error;
        await existing.unsubscribe();
        if (!(await setPreference("push_enabled", false, false))) throw new Error("Could not save the push setting.");
        setPushSubscription(false);
        toast.success("Web push notifications disabled");
      } else {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== "granted") throw new Error("Allow notifications in your browser to enable web push.");
        const publicKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"];
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const keys = subscription.toJSON().keys;
        if (!keys?.p256dh || !keys?.auth) throw new Error("The browser did not return valid push keys.");
        const { error } = await (supabase as any).from("push_subscriptions").upsert({
          user_id: user.id, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth,
        }, { onConflict: "user_id,endpoint" });
        if (error) { await subscription.unsubscribe(); throw error; }
        if (!(await setPreference("push_enabled", true, false))) { await subscription.unsubscribe(); throw new Error("Could not save the push setting."); }
        setPushSubscription(true);
        toast.success("Web push notifications enabled");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update web push settings.");
    } finally {
      setPushBusy(false);
    }
  }

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
    if (isPro) profileUpdate.profile_theme = String(f.get("profile_theme") || "default");
    const { error } = await (supabase as any).from("profiles").update(profileUpdate).eq("id", user.id);
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
        <div className="space-y-1.5">
          <Label htmlFor="profile_theme">Profile theme · PRO</Label>
          <select id="profile_theme" name="profile_theme" defaultValue={(p as any).profile_theme ?? "default"} disabled={!isPro} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60">
            <option value="default">REPUNIT Red</option><option value="ember">Ember</option><option value="steel">Steel</option><option value="violet">Violet</option>
          </select>
          {!isPro && <p className="text-xs text-muted-foreground">Custom profile themes are a PRO feature. <a href="/pricing" className="font-semibold text-primary hover:underline">Upgrade to PRO</a>.</p>}
        </div>
        <div className="space-y-1.5"><Label htmlFor="country_code">Country</Label><select id="country_code" name="country_code" defaultValue={(p as any).country_code ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select your country</option><option value="CZ">Czechia</option><option value="SK">Slovakia</option><option value="UA">Ukraine</option><option value="PL">Poland</option><option value="DE">Germany</option><option value="AT">Austria</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="OT">Other</option></select><p className="text-xs text-muted-foreground">Used to show crew rankings in your country.</p></div>
        <Button variant="hero">Save profile</Button>
      </form>
      <section className="mt-8 max-w-xl rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-3"><Bell className="h-5 w-5 text-primary"/><div><h2 className="font-stat text-2xl uppercase">Notifications</h2><p className="text-xs text-muted-foreground">Choose what REPUNIT should tell you about.</p></div></div>
        {preferences.isLoading ? <p className="py-6 text-sm text-muted-foreground">Loading preferences…</p> : preferences.isError ? <div className="py-5"><p className="text-sm text-muted-foreground">Notification settings are not available yet. Apply database migration 0015 first.</p><Button className="mt-3" variant="line" size="sm" onClick={() => void preferences.refetch()}>Try again</Button></div> : <div className="mt-4 divide-y divide-border">
          {notificationOptions.map(({key,label,description,icon:Icon}) => <div key={key} className="flex items-center gap-3 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary"><Icon className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={Boolean((preferences.data as any)?.[key])} onCheckedChange={(value) => void setPreference(key,value)} aria-label={label}/></div>)}
        </div>}
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Web push notifications</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Get REPUNIT alerts even when the app is closed. Your browser must allow notifications.</p></div>
            <Button size="sm" variant={pushSubscription ? "line" : "hero"} disabled={!pushSupported || pushBusy} onClick={() => void toggleWebPush()}>{pushBusy ? "Updating…" : pushSubscription ? "Disable push" : "Enable push"}</Button>
          </div>
          {!pushSupported && <p className="mt-3 text-[11px] text-muted-foreground">Push is unavailable in this browser or the VAPID public key has not been configured.</p>}
          {pushPermission === "denied" && <p className="mt-2 text-[11px] text-amber-300">Notifications are blocked by your browser. Change the site permission in browser settings first.</p>}
        </div>
      </section>
    </PageShell>
  );
}
