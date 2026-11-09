import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserRound, BellRing, BellOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMyProfile } from "@/hooks/use-session";
import { USERNAME_RE } from "@/lib/lifts";
import { NotificationControls } from "@/components/notification-controls";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ property: "og:title", content: "Settings — REPUNIT" }, { property: "og:description", content: "Edit your REPUNIT profile and profile settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Settings — REPUNIT" }, { name: "description", content: "Edit your REPUNIT profile and profile settings." }] }),
  component: Settings,
});

function vapidKeyBytes(base64: string): Uint8Array {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function Settings() {
  const { user } = Route.useRouteContext();
  const { data: p, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useMyProfile(user.id);
  const qc = useQueryClient();
  const [avatar, setAvatar] = useState<File | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const pushQuery = useQuery({
    queryKey: ["push-subscriptions", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("push_subscriptions").select("id,endpoint").eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const pushEnabled = (pushQuery.data?.length ?? 0) > 0;
  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushConfigured = Boolean(import.meta.env["VITE_VAPID_PUBLIC_KEY"]);
  async function enablePush() {
    if (!pushSupported) { toast.error("Web push is not supported in this browser."); return; }
    const publicKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"];
    if (!publicKey) { toast.error("Push notifications are not configured on this deployment yet."); return; }
    setPushBusy(true);
    try {
      if (Notification.permission === "denied") throw new Error("Notifications are blocked in your browser settings.");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications to enable push.");
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(publicKey) as unknown as BufferSource,
        });
      }
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys?.["auth"]) throw new Error("The browser returned an incomplete push subscription.");
      const { error: subscriptionError } = await (supabase as any).from("push_subscriptions").upsert({
        user_id: user.id, endpoint: json.endpoint, p256dh: json.keys["p256dh"], auth: json.keys["auth"],
      }, { onConflict: "user_id,endpoint" });
      if (subscriptionError) throw subscriptionError;
      const { error: preferenceError } = await (supabase as any).from("notification_preferences").upsert({
        user_id: user.id, push_enabled: true,
      }, { onConflict: "user_id" });
      if (preferenceError) throw preferenceError;
      await pushQuery.refetch();
      toast.success("Push notifications enabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const { error } = await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
        if (error) throw error;
      }
      const { error: preferenceError } = await (supabase as any).from("notification_preferences").upsert({
        user_id: user.id, push_enabled: false,
      }, { onConflict: "user_id" });
      if (preferenceError) throw preferenceError;
      await pushQuery.refetch();
      toast.success("Push notifications disabled.");
    } catch {
      toast.error("Could not disable push notifications. Please try again.");
    } finally {
      setPushBusy(false);
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    if (!USERNAME_RE.test(username)) { toast.error("Username: 3–20 lowercase letters, numbers or _."); return; }
    const profileUpdate: Record<string, unknown> = {
      username, display_name: String(f.get("display_name")).slice(0, 40) || null, bio: String(f.get("bio")).slice(0, 280) || null,
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

        <Button variant="hero">Save profile</Button>
      </form>
      <section className="mt-5 flex max-w-xl items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{pushEnabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1"><h2 className="font-bold">Push notifications</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{!pushSupported ? "This browser does not support web push. On iPhone, install REPUNIT to your Home Screen first." : !pushConfigured ? "Push is not configured on this deployment yet." : pushQuery.isError ? "Push status could not be loaded." : pushEnabled ? "You'll receive REPUNIT updates even when the app is closed." : "Get notified about friend PRs, challenges and Crew Battles."}</p></div>
        <Button type="button" size="sm" variant={pushEnabled ? "line" : "hero"} disabled={pushBusy || pushQuery.isLoading || !pushSupported || !pushConfigured || pushQuery.isError} onClick={() => void (pushEnabled ? disablePush() : enablePush())}>{pushBusy ? "Saving…" : pushEnabled ? "Disable" : "Enable"}</Button>
      </section>
      <NotificationControls userId={user.id} />
    </PageShell>
  );
}
