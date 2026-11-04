import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Dumbbell, Plus, Trash2, Globe, Lock, Users, Search, CalendarDays, Flame } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
// Workout tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Plan = {
  id: string;
  user_id: string;
  title: string;
  workout_day: string;
  visibility: "public" | "private" | "followers";
  created_at: string;
};
type PlanExercise = { id: string; plan_id: string; exercise_name: string; sets: number; reps: string; rest_seconds: number; notes: string | null; position: number };
type CatalogExercise = { name: string; category: string; popularity: number; image: string };

const CATALOG: CatalogExercise[] = [
  { name: "Barbell Bench Press", category: "Chest", popularity: 100, image: "Barbell_Bench_Press_-_Medium" },
  { name: "Squat", category: "Legs", popularity: 98, image: "Barbell_Squat" },
  { name: "Deadlift", category: "Back", popularity: 96, image: "Barbell_Deadlift" },
  { name: "Lat Pulldown", category: "Back", popularity: 94, image: "Wide-Grip_Lat_Pulldown" },
  { name: "Dumbbell Shoulder Press", category: "Shoulders", popularity: 92, image: "Dumbbell_Shoulder_Press" },
  { name: "Biceps Curl", category: "Arms", popularity: 90, image: "Dumbbell_Bicep_Curl" },
  { name: "Incline Dumbbell Press", category: "Chest", popularity: 89, image: "Incline_Dumbbell_Press" },
  { name: "Triceps Pushdown", category: "Arms", popularity: 88, image: "Triceps_Pushdown" },
  { name: "Seated Cable Row", category: "Back", popularity: 86, image: "Seated_Cable_Rows" },
  { name: "Leg Press", category: "Legs", popularity: 85, image: "Leg_Press" },
  { name: "Lateral Raise", category: "Shoulders", popularity: 84, image: "Dumbbell_Lateral_Raise" },
  { name: "Romanian Deadlift", category: "Legs", popularity: 82, image: "Romanian_Deadlift" },
  { name: "Pull-up", category: "Back", popularity: 80, image: "Pull-Up" },
  { name: "Chest Fly", category: "Chest", popularity: 78, image: "Dumbbell_Flyes" },
  { name: "Leg Curl", category: "Legs", popularity: 76, image: "Lying_Leg_Curls" },
  { name: "Leg Extension", category: "Legs", popularity: 74, image: "Leg_Extensions" },
  { name: "Overhead Press", category: "Shoulders", popularity: 72, image: "Standing_Military_Press" },
  { name: "Hammer Curl", category: "Arms", popularity: 70, image: "Hammer_Curls" },
  { name: "Face Pull", category: "Shoulders", popularity: 68, image: "Face_Pulls" },
  { name: "Cable Crunch", category: "Core", popularity: 66, image: "Cable_Crunch" },
  { name: "Plank", category: "Core", popularity: 64, image: "Plank" },
  { name: "Hip Thrust", category: "Legs", popularity: 62, image: "Barbell_Hip_Thrust" },
  { name: "Bulgarian Split Squat", category: "Legs", popularity: 60, image: "Bulgarian_Split_Squat" },
  { name: "Machine Chest Press", category: "Chest", popularity: 58, image: "Chest_Press_Machine" },
  { name: "Arnold Press", category: "Shoulders", popularity: 56, image: "Arnold_Dumbbell_Press" },
  { name: "Preacher Curl", category: "Arms", popularity: 54, image: "Preacher_Curl" },
  { name: "Skull Crusher", category: "Arms", popularity: 52, image: "EZ-Bar_Skullcrusher" },
  { name: "Calf Raise", category: "Legs", popularity: 50, image: "Standing_Calf_Raises" },
  { name: "T-Bar Row", category: "Back", popularity: 48, image: "T-Bar_Row" },
  { name: "Dips", category: "Chest", popularity: 46, image: "Dips" },
].map((item) => ({ ...item, image: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(item.image.trim())}/0.jpg` }));

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORIES = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];

export const Route = createFileRoute("/_authenticated/workouts")({
  head: () => ({ meta: [{ title: "Workout plans — REPUNIT" }, { name: "description", content: "Build, save and share your training plans." }] }),
  component: WorkoutsPage,
});

function WorkoutsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [workoutDay, setWorkoutDay] = useState("Monday");
  const [visibility, setVisibility] = useState<"public" | "private" | "followers">("private");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8-12");
  const [rest, setRest] = useState("90");
  const [draftExercises, setDraftExercises] = useState<Array<{ exercise_name: string; sets: number; reps: string; rest_seconds: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [category, setCategory] = useState("All");

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

  const filteredCatalog = useMemo(() => CATALOG
    .filter((item) => category === "All" || item.category === category)
    .filter((item) => item.name.toLowerCase().includes(exerciseSearch.toLowerCase()))
    .sort((a, b) => b.popularity - a.popularity), [category, exerciseSearch]);

  function addExercise(name: string) {
    setDraftExercises((items) => [...items, { exercise_name: name, sets: Number(sets) || 3, reps: reps.trim() || "8-12", rest_seconds: Number(rest) || 90 }]);
    setPickerOpen(false);
    setExerciseSearch("");
  }

  async function createPlan() {
    if (saving || title.trim().length < 2 || draftExercises.length === 0) {
      toast.error("Add a workout name and at least one exercise.");
      return;
    }
    setSaving(true);
    try {
      const { data: plan, error } = await db.from("workout_plans").insert({
        user_id: user.id, title: title.trim(), workout_day: workoutDay, visibility,
      }).select("id").single();
      if (error) throw error;
      const { error: exerciseError } = await db.from("workout_plan_exercises").insert(
        draftExercises.map((item, index) => ({ ...item, plan_id: plan.id, position: index }))
      );
      if (exerciseError) {
        await db.from("workout_plans").delete().eq("id", plan.id);
        throw exerciseError;
      }
      setTitle(""); setWorkoutDay("Monday"); setDraftExercises([]); setVisibility("private");
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success("Workout saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create workout.");
    } finally { setSaving(false); }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm("Delete this workout?")) return;
    const { error } = await db.from("workout_plans").delete().eq("id", plan.id).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else { await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] }); toast.success("Workout deleted."); }
  }

  const plans = plansQuery.data ?? [];
  return (
    <PageShell>
      <div className="mb-8">
        <p className="eyebrow">PLAN YOUR TRAINING</p>
        <h1 className="font-stat mt-2 text-6xl uppercase">Workouts<span className="text-primary">.</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">Build your split, choose your training days and share your routine.</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Create a workout</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workout name</label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Push day / Upper body" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Training day</label><select value={workoutDay} onChange={(e) => setWorkoutDay(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{DAYS.map((day) => <option key={day}>{day}</option>)}</select></div>
        </div>
        <div className="mt-3"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who can see this workout?</label><select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"><option value="private">Private — only me</option><option value="public">Public — everyone</option><option value="followers">Followers</option></select></div>

        <div className="mt-6 rounded-xl border border-border bg-background/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Exercises</h3><p className="text-xs text-muted-foreground">Add movements from the exercise library.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{draftExercises.length} added</span></div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div><label className="mb-1 block text-xs text-muted-foreground">Sets</label><Input value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" /></div>
            <div><label className="mb-1 block text-xs text-muted-foreground">Reps</label><Input value={reps} onChange={(e) => setReps(e.target.value)} maxLength={20} /></div>
            <div><label className="mb-1 block text-xs text-muted-foreground">Rest (sec)</label><Input value={rest} onChange={(e) => setRest(e.target.value)} inputMode="numeric" /></div>
          </div>
          <Button type="button" variant="hero" className="w-full" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4" />Add exercise</Button>
          {draftExercises.length > 0 ? <ol className="mt-4 space-y-2">{draftExercises.map((item, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"><span className="min-w-0"><b>{i + 1}. {item.exercise_name}</b><span className="block text-xs text-muted-foreground">{item.sets} sets × {item.reps} · {item.rest_seconds}s rest</span></span><button onClick={() => setDraftExercises((all) => all.filter((_, index) => index !== i))} aria-label="Remove exercise" className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}</ol> : <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Your exercise list is empty. Tap “Add exercise” to get started.</p>}
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">You can edit visibility at any time by recreating the plan.</p><Button variant="hero" disabled={saving} onClick={createPlan}>{saving ? "Saving…" : "Save workout"}</Button></div>
      </section>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border p-5 pb-3"><DialogTitle className="text-left text-xl">Exercise library</DialogTitle><p className="text-left text-sm text-muted-foreground">Most popular exercises first. Choose one to add it to your workout.</p></DialogHeader>
          <div className="space-y-3 px-5 pt-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={exerciseSearch} onChange={(e) => setExerciseSearch(e.target.value)} placeholder="Search exercises…" className="pl-9" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${category === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item}</button>)}</div>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto p-5 pt-2">
            {filteredCatalog.map((item, index) => <button key={item.name} onClick={() => addExercise(item.name)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition hover:border-primary/60 hover:bg-elevated">
              <div className="relative h-[76px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-muted"><img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /><div className="absolute inset-0 -z-0 flex items-center justify-center text-muted-foreground"><Dumbbell className="h-6 w-6" /></div></div>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.category}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{index < 5 ? <Flame className="h-3 w-3" /> : null}{index < 5 ? "Popular" : "Exercise"}</span></span>
              <Plus className="mr-2 h-5 w-5 shrink-0 text-primary" />
            </button>)}
            {filteredCatalog.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No exercises found. Try another search.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Your workouts</h2>
        {plansQuery.isLoading ? <p className="text-muted-foreground">Loading workouts…</p> : plansQuery.isError ? <p className="text-destructive">Could not load workouts. The workout database migration may need to be applied.</p> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><Dumbbell className="mx-auto mb-3 h-8 w-8" />No workouts yet. Create your first one above.</div> : (
          <div className="grid gap-3 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{plan.title}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{plan.workout_day || "Training day not set"}</p></div><button onClick={() => void deletePlan(plan)} aria-label="Delete workout" className="rounded-md p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-3 flex items-center gap-2 text-xs uppercase text-muted-foreground">{plan.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : plan.visibility === "public" ? <Globe className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}{plan.visibility}</div>
            <Button className="mt-4 w-full" variant="line" onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}>{expanded === plan.id ? "Hide exercises" : "View exercises"}</Button>
            {expanded === plan.id && <div className="mt-3 space-y-2">{exercisesQuery.isLoading ? <p className="text-sm">Loading…</p> : (exercisesQuery.data ?? []).map((ex, i) => <div key={ex.id} className="rounded-lg bg-background p-3 text-sm"><b>{i + 1}. {ex.exercise_name}</b><p className="text-muted-foreground">{ex.sets} sets × {ex.reps} · {ex.rest_seconds}s rest</p></div>)}</div>}
          </article>)}</div>
        )}
      </section>
    </PageShell>
  );
}
