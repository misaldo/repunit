import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Moon, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Preferences = {
  notify_friend_prs: boolean;
  notify_challenges: boolean;
  notify_crew_battles: boolean;
  notify_events: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
};

const defaults: Preferences = {
  notify_friend_prs: true,
  notify_challenges: true,
  notify_crew_battles: true,
  notify_events: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

const categories: { key: keyof Pick<Preferences, "notify_friend_prs" | "notify_challenges" | "notify_crew_battles" | "notify_events">; title: string; description: string }[] = [
  { key: "notify_friend_prs", title: "Friend PRs", description: "When someone you follow sets a new record" },
  { key: "notify_challenges", title: "Challenges", description: "Rivalries and direct challenges" },
  { key: "notify_crew_battles", title: "Crew battles", description: "Battle invites and results" },
  { key: "notify_events", title: "Events and seasons", description: "Competition updates and results" },
];

export function NotificationControls({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notification_preferences")
        .select("notify_friend_prs,notify_challenges,notify_crew_battles,notify_events,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone")
        .eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    setPrefs({
      notify_friend_prs: query.data.notify_friend_prs ?? true,
      notify_challenges: query.data.notify_challenges ?? true,
      notify_crew_battles: query.data.notify_crew_battles ?? true,
      notify_events: query.data.notify_events ?? true,
      quiet_hours_enabled: query.data.quiet_hours_enabled ?? false,
      quiet_hours_start: String(query.data.quiet_hours_start ?? "22:00").slice(0, 5),
      quiet_hours_end: String(query.data.quiet_hours_end ?? "08:00").slice(0, 5),
      timezone: query.data.timezone || defaults.timezone,
    });
  }, [query.data]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(current => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("notification_preferences").upsert({
        user_id: userId,
        ...prefs,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["notification-preferences", userId] });
      toast.success("Notification settings saved.");
    } catch {
      toast.error("Could not save notification settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-5 max-w-xl rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="h-5 w-5" /></div><div><h2 className="font-bold">Notification preferences</h2><p className="text-xs text-muted-foreground">Choose what reaches you and when.</p></div></div>
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[.06] p-3 text-xs"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>Maximum 3 push notifications per day. REPUNIT will quietly hold back extras.</span></div>
    {query.isError && <p className="mt-3 text-xs text-muted-foreground">Your preferences could not be loaded. You can still update and save these settings.</p>}
    <div className="mt-3 divide-y divide-border">
      {categories.map(item => <label key={item.key} className="flex min-h-14 cursor-pointer items-center gap-3 py-3">
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span></span>
        <input type="checkbox" checked={prefs[item.key]} onChange={event => update(item.key, event.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
      </label>)}
    </div>
    <div className="mt-4 rounded-xl border border-border bg-background/50 p-3">
      <label className="flex items-center gap-3"><Moon className="h-4 w-4 text-primary" /><span className="flex-1 text-sm font-semibold">Quiet hours</span><input type="checkbox" checked={prefs.quiet_hours_enabled} onChange={event => update("quiet_hours_enabled", event.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" /></label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">From<input type="time" value={prefs.quiet_hours_start} onChange={event => update("quiet_hours_start", event.target.value)} disabled={!prefs.quiet_hours_enabled} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground disabled:opacity-50" /></label>
        <label className="text-xs text-muted-foreground">Until<input type="time" value={prefs.quiet_hours_end} onChange={event => update("quiet_hours_end", event.target.value)} disabled={!prefs.quiet_hours_enabled} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground disabled:opacity-50" /></label>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Times use your device timezone: {prefs.timezone}.</p>
    </div>
    <button type="button" onClick={() => void save()} disabled={saving || query.isLoading} className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save notification settings"}</button>
  </section>;
}
