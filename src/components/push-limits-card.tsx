import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Limits = {
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
  daily_push_cap: number;
};

const DEFAULTS: Limits = { quiet_hours_enabled: false, quiet_start: 22, quiet_end: 8, timezone: "UTC", daily_push_cap: 3 };
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const CAPS = [1, 2, 3, 5, 10];
const selectClass = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Quiet hours and a daily cap for push notifications. In-app notifications are never limited. */
export function PushLimitsCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Limits>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["push-limits", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("quiet_hours_enabled,quiet_start,quiet_end,timezone,daily_push_cap")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Limits | null;
    },
  });

  useEffect(() => {
    if (query.isSuccess) {
      setForm({ ...DEFAULTS, ...(query.data ?? {}), timezone: query.data?.timezone && query.data.timezone !== "UTC" ? query.data.timezone : browserTimeZone() });
    }
  }, [query.isSuccess, query.data]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("notification_preferences").upsert({
        user_id: userId,
        quiet_hours_enabled: form.quiet_hours_enabled,
        quiet_start: form.quiet_start,
        quiet_end: form.quiet_end,
        timezone: form.timezone || "UTC",
        daily_push_cap: form.daily_push_cap,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Notification limits saved");
      await qc.invalidateQueries({ queryKey: ["push-limits", userId] });
    } catch {
      toast.error("Could not save your notification limits. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 max-w-xl rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Moon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Quiet hours and limits</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Control when push notifications may reach you. Everything still appears in your notification center.</p>
        </div>
      </div>

      {query.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">Your limits could not be loaded. <button type="button" className="font-semibold text-primary underline" onClick={() => void query.refetch()}>Retry</button></p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
            <span>Pause pushes during quiet hours</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[hsl(var(--primary))]"
              checked={form.quiet_hours_enabled}
              onChange={(event) => setForm({ ...form, quiet_hours_enabled: event.target.checked })}
            />
          </label>
          {form.quiet_hours_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">From
                <select className={selectClass} value={form.quiet_start} onChange={(event) => setForm({ ...form, quiet_start: Number(event.target.value) })}>
                  {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Until
                <select className={selectClass} value={form.quiet_end} onChange={(event) => setForm({ ...form, quiet_end: Number(event.target.value) })}>
                  {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </select>
              </label>
              <p className="col-span-2 text-[11px] text-muted-foreground">Time zone: {form.timezone}</p>
            </div>
          )}
          <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Max pushes per day
            <select className={selectClass} value={form.daily_push_cap} onChange={(event) => setForm({ ...form, daily_push_cap: Number(event.target.value) })}>
              {CAPS.map((cap) => <option key={cap} value={cap}>{cap}</option>)}
            </select>
          </label>
          <Button type="button" variant="hero" disabled={saving || query.isLoading} onClick={() => void save()}>{saving ? "Saving…" : "Save limits"}</Button>
        </div>
      )}
    </section>
  );
}
