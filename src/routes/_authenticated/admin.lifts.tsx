import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { exerciseLabel } from "@/lib/lifts";

export const Route = createFileRoute("/_authenticated/admin/lifts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lift review — REPUNIT" },
      { name: "description", content: "Admin review queue for lift video submissions." },
    ],
  }),
  component: AdminLifts,
});

type PendingLift = {
  id: string;
  user_id: string;
  exercise: string;
  weight_kg: number;
  reps: number;
  lifted_on: string;
  description: string | null;
  video_path: string;
  created_at: string;
  username: string | null;
  video_url: string | null;
};

function AdminLifts() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ["admin-pending-lifts", user.id],
    queryFn: async (): Promise<PendingLift[]> => {
      // This RPC performs the admin-role check in PostgreSQL. UI checks are not
      // used as the security boundary.
      const { data, error } = await (supabase as any).rpc("admin_list_pending_lifts");
      if (error) throw error;
      const lifts = (data ?? []) as unknown as Array<Record<string, any>>;
      if (!lifts.length) return [];

      const userIds = [...new Set(lifts.map((lift) => String(lift["user_id"])))];
      const [profilesResult, rows] = await Promise.all([
        supabase.from("profiles").select("id, username").in("id", userIds),
        Promise.all(lifts.map(async (lift) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from("lift-videos")
            .createSignedUrl(String(lift["video_path"]), 60 * 60);
          return {
            ...lift,
            video_url: signedError ? null : signed?.signedUrl ?? null,
          };
        })),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      const usernames = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.username]));
      return rows.map((lift) => ({
        ...lift,
        username: usernames.get(String((lift as Record<string, any>)["user_id"])) ?? null,
      })) as PendingLift[];
    },
    retry: false,
    staleTime: 0,
  });

  async function review(liftId: string, decision: "approve" | "reject") {
    if (busyId) return;
    setBusyId(liftId);
    const { error } = await (supabase as any).rpc("admin_review_lift", {
      _lift_id: liftId,
      _decision: decision,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Could not review this lift.");
      return;
    }
    toast.success(decision === "approve" ? "Lift verified · 25 XP awarded" : "Lift rejected");
    await queryClient.invalidateQueries({ queryKey: ["admin-pending-lifts", user.id] });
    await queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  if (pending.isError) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 font-stat text-3xl uppercase">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This queue is available only to accounts with the admin role. The database rejected this request.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">MODERATION</p>
          <h1 className="font-stat text-5xl uppercase">Lift review<span className="text-primary">.</span></h1>
          <p className="mt-1 text-sm text-muted-foreground">Only video submissions can be approved.</p>
        </div>
        <Button variant="line" size="icon" aria-label="Refresh queue" onClick={() => void pending.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {pending.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading pending lifts…</p>
      ) : pending.data?.length ? (
        <div className="mt-6 space-y-4">
          {pending.data.map((lift) => (
            <article key={lift.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="eyebrow">{lift.username ? `@${lift.username}` : "REPUNIT lifter"} · {lift.lifted_on}</p>
                  <h2 className="font-stat mt-1 text-3xl uppercase">{exerciseLabel(lift.exercise as any)}</h2>
                  <p className="font-stat text-2xl tabular-nums">{Number(lift.weight_kg)} kg × {lift.reps}</p>
                </div>
                <StatusBadge status="PENDING" />
              </div>
              {lift.video_url ? (
                <video src={lift.video_url} controls playsInline preload="metadata" className="max-h-[520px] w-full bg-black object-contain" />
              ) : (
                <div className="bg-muted px-4 py-12 text-center text-sm text-muted-foreground">
                  Video could not be loaded. Refresh the queue and try again.
                </div>
              )}
              {lift.description && <p className="px-4 pt-3 text-sm text-muted-foreground">{lift.description}</p>}
              <div className="flex gap-2 p-4">
                <Button className="flex-1" variant="hero" disabled={busyId !== null || !lift.video_url} onClick={() => void review(lift.id, "approve")}>
                  <Check className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button className="flex-1" variant="destructive" disabled={busyId !== null || !lift.video_url} onClick={() => void review(lift.id, "reject")}>
                  <X className="mr-2 h-4 w-4" /> Reject
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No pending video lifts</h2>
          <p className="mt-1 text-sm text-muted-foreground">New submissions with video evidence will appear here.</p>
        </div>
      )}
    </PageShell>
  );
}
