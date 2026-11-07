import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bell, CheckCheck, Dumbbell, Trophy, Swords, MessageCircle, Heart, Flame, Medal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — REPUNIT" }, { name: "description", content: "Your REPUNIT activity and alerts." }] }),
  component: NotificationsPage,
});

const iconByKind: Record<string, any> = {
  lift: Dumbbell, pr: Trophy, like: Heart, comment: MessageCircle,
  challenge: Swords, rank: Medal, battle: Swords, streak: Flame, system: Sparkles,
};
const labelByKind: Record<string, string> = {
  lift: "Workout", pr: "Personal record", like: "Like", comment: "Comment",
  challenge: "Challenge", rank: "Rank", battle: "Battle", streak: "Streak", system: "REPUNIT",
};

function NotificationsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["notifications", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notifications")
        .select("id,actor_id,kind,title,body,href,read_at,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    const channel = supabase.channel("repunit-notifications-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + user.id }, () => {
        void qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        void qc.invalidateQueries({ queryKey: ["unread-notifications", user.id] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user.id, qc]);

  const notifications = query.data ?? [];
  const unread = notifications.filter((n: any) => !n.read_at).length;
  async function markAllRead() {
    const { error } = await (supabase as any).from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).is("read_at", null);
    if (error) { toast.error("Could not mark notifications as read. Try again."); return; }
    await qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    await qc.invalidateQueries({ queryKey: ["unread-notifications", user.id] });
    toast.success("All caught up");
  }
  async function openNotification(item: any) {
    if (!item.read_at) {
      const { error } = await (supabase as any).from("notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user.id);
      if (error) {
        toast.error("Could not mark this notification as read.");
      } else {
        await qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        await qc.invalidateQueries({ queryKey: ["unread-notifications", user.id] });
      }
    }
    const href = typeof item.href === "string" && item.href.startsWith("/") ? item.href : "/notifications";
    if (href.startsWith("/u/") || href.startsWith("/battles/") || href.startsWith("/records/")) window.location.assign(href);
    else if (href === "/feed") void navigate({ to: "/feed" });
    else if (href === "/challenges") void navigate({ to: "/challenges" });
    else if (href === "/leaderboards") void navigate({ to: "/leaderboards" });
    else void navigate({ to: "/dashboard" });
  }

  return <PageShell>
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow text-primary">YOUR ACTIVITY</p><div className="mt-2 flex items-center gap-3"><Bell className="h-8 w-8 text-primary"/><h1 className="font-stat text-5xl uppercase sm:text-6xl">Notifications</h1></div><p className="mt-2 text-sm text-muted-foreground">Every lift, rivalry and milestone that matters.</p></div>
        <div className="flex items-center gap-3"><span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">{unread} unread</span><Button variant="line" size="sm" disabled={!unread} onClick={() => void markAllRead()}><CheckCheck className="mr-2 h-4 w-4"/>Mark all read</Button></div>
      </div>
    </div>
    <div className="mt-6 space-y-2">
      {query.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading your activity…</p>
      : query.isError ? <div className="rounded-2xl border border-border p-6"><p>Could not load notifications.</p><Button className="mt-3" variant="line" onClick={() => void query.refetch()}>Try again</Button></div>
      : notifications.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center"><Bell className="mx-auto h-8 w-8 text-muted-foreground"/><h2 className="mt-3 font-bold">You’re all caught up</h2><p className="mt-1 text-sm text-muted-foreground">New activity from your crew and friends will show up here.</p></div>
      : notifications.map((item: any) => {
        const Icon = iconByKind[item.kind] ?? Bell;
        return <button key={item.id} onClick={() => void openNotification(item)} className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition hover:border-primary/40 hover:bg-card ${item.read_at ? "border-border bg-background/50" : "border-primary/25 bg-primary/[0.045]"}`}>
          <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.read_at ? "bg-card text-muted-foreground" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5"/></span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.title}</strong>{!item.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary"/>}<span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{labelByKind[item.kind] ?? "Activity"}</span></span><span className="mt-1 block text-sm text-muted-foreground">{item.body}</span><span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></span>
        </button>;
      })}
    </div>
  </PageShell>;
}
