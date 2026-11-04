import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dumbbell, Plus, Trash2, Globe, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
// Workout tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Plan = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  visibility: "public" | "private" | "followers";
  created_at: string;
};
type PlanExercise = { id: string; plan_id: string; exercise_name: string; sets: number; reps: string; rest_seconds: number; notes: string | null; position: number };

export const Route = createFileRoute("/_authenticated/workouts")({
  head: () => ({ meta: [{ title: "Workout plans — REPUNIT" }, { name: "description", content: "Build, save and share your training plans." }] }),
  component: WorkoutsPage,
});

function WorkoutsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "followers">("private");
  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8-12");
  const [rest, setRest] = useState("90");
  const [draftExercises, setDraftExercises] = useState<Array<{ exercise_name: string; sets: number; reps: string; rest_seconds: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ["workout-plans", user.id],
    queryFn: async () => {
      const { data, error } = await db.from("workout_plans").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  const exercisesQuery = useQuery({
    queryKey: ["workout-plan-exercises", expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await db.from("workout_plan_exercises").select("*").eq("plan_id", expanded!).order("position");
      if (error) throw error;
      return (data ?? []) as PlanExercise[];
    },
  });

  function addExercise() {
    const name = exerciseName.trim();
    const s = Number(sets);
    const r = Number(rest);
    if (!name || !Number.isInteger(s) || s < 1 || s > 30 || !reps.trim() || !Number.isInteger(r) || r < 0 || r > 1800) {
      toast.error("Check exercise, sets, reps and rest time.");
      return;
    }
    setDraftExercises((items) => [...items, { exercise_name: name, sets: s, reps: reps.trim(), rest_seconds: r }]);
    setExerciseName("");
  }

  async function createPlan() {
    if (saving || title.trim().length < 2 || draftExercises.length === 0) {
      toast.error("Add a title and at least one exercise.");
      return;
    }
    setSaving(true);
    try {
      const { data: plan, error } = await db.from("workout_plans").insert({
        user_id: user.id, title: title.trim(), description: description.trim() || null, visibility,
      }).select("id").single();
      if (error) throw error;
      const { error: exerciseError } = await db.from("workout_plan_exercises").insert(
        draftExercises.map((item, index) => ({ ...item, plan_id: plan.id, position: index }))
      );
      if (exerciseError) {
        await db.from("workout_plans").delete().eq("id", plan.id);
        throw exerciseError;
      }
      setTitle(""); setDescription(""); setDraftExercises([]); setVisibility("private");
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success("Workout plan created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create workout plan.");
    } finally { setSaving(false); }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm("Delete this workout plan?")) return;
    const { error } = await db.from("workout_plans").delete().eq("id", plan.id).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else { await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] }); toast.success("Plan deleted."); }
  }

  const plans = plansQuery.data ?? [];
  return (
    <PageShell>
      <div className="mb-8">
        <p className="eyebrow">TRAIN WITH INTENT</p>
        <h1 className="font-stat mt-2 text-6xl uppercase">Workout plans<span className="text-primary">.</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">Build your split. Keep it private or share it with the community.</p>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Create a plan</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Plan name — e.g. Push / Pull / Legs" className="rounded-xl border border-border bg-background p-3 text-sm" />
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="rounded-xl border border-border bg-background p-3 text-sm">
            <option value="private">Private — only me</option><option value="public">Public — everyone</option><option value="followers">Followers</option>
          </select>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="Description / training goal (optional)" className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm" />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} maxLength={80} placeholder="Exercise" className="rounded-xl border border-border bg-background p-3 text-sm" />
          <input value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" placeholder="Sets" className="rounded-xl border border-border bg-background p-3 text-sm" />
          <input value={reps} onChange={(e) => setReps(e.target.value)} maxLength={20} placeholder="Reps" className="rounded-xl border border-border bg-background p-3 text-sm" />
          <div className="flex gap-2"><input value={rest} onChange={(e) => setRest(e.target.value)} inputMode="numeric" placeholder="Rest sec" className="min-w-0 flex-1 rounded-xl border border-border bg-background p-3 text-sm" /><Button type="button" variant="line" onClick={addExercise}>Add</Button></div>
        </div>
        {draftExercises.length > 0 && <ol className="mt-4 space-y-2">{draftExercises.map((item, i) => <li key={i} className="flex items-center justify-between rounded-lg bg-background p-3 text-sm"><span><b>{i + 1}. {item.exercise_name}</b><span className="ml-2 text-muted-foreground">{item.sets} sets × {item.reps} · {item.rest_seconds}s rest</span></span><button onClick={() => setDraftExercises((all) => all.filter((_, index) => index !== i))} aria-label="Remove exercise"><Trash2 className="h-4 w-4 text-muted-foreground" /></button></li>)}</ol>}
        <Button variant="hero" className="mt-5" disabled={saving} onClick={createPlan}>{saving ? "Saving…" : "Save workout plan"}</Button>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Your plans</h2>
        {plansQuery.isLoading ? <p className="text-muted-foreground">Loading plans…</p> : plansQuery.isError ? <p className="text-destructive">Could not load plans. Apply the workout-plan SQL migration first.</p> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><Dumbbell className="mx-auto mb-3 h-8 w-8" />No plans yet. Create your first one above.</div> : (
          <div className="grid gap-3 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{plan.title}</h3><p className="mt-1 text-sm text-muted-foreground">{plan.description || "No description"}</p></div><button onClick={() => void deletePlan(plan)} aria-label="Delete plan" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-3 flex items-center gap-2 text-xs uppercase text-muted-foreground">{plan.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : plan.visibility === "public" ? <Globe className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}{plan.visibility}</div>
            <Button className="mt-4 w-full" variant="line" onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}>{expanded === plan.id ? "Hide exercises" : "View exercises"}</Button>
            {expanded === plan.id && <div className="mt-3 space-y-2">{exercisesQuery.isLoading ? <p className="text-sm">Loading…</p> : (exercisesQuery.data ?? []).map((ex, i) => <div key={ex.id} className="rounded-lg bg-background p-3 text-sm"><b>{i + 1}. {ex.exercise_name}</b><p className="text-muted-foreground">{ex.sets} sets × {ex.reps} · {ex.rest_seconds}s rest</p>{ex.notes && <p>{ex.notes}</p>}</div>)}</div>}
          </article>)}</div>
        )}
      </section>
    </PageShell>
  );
}
