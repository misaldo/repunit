// @ts-nocheck -- references backend features not yet set up; typed once their tables exist
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Dumbbell, Plus, Trash2, Globe, Lock, Users, Search, CalendarDays } from "lucide-react";
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
  workout_day?: string;
  visibility: "public" | "private" | "followers";
  created_at: string;
};
type PlanExercise = { id: string; plan_id: string; exercise_name: string; sets: number; reps: string; rest_seconds: number; notes: string | null; position: number };
type CatalogExercise = { name: string; category: string; popularity: number; image: string; id?: string };
type ExerciseDbEntry = { id: string; name: string; images?: string[]; primaryMuscles?: string[]; category?: string };

const CATALOG: CatalogExercise[] = [
  { name: "Barbell Bench Press", category: "Chest", popularity: 100, image: "Barbell_Bench_Press_-_Medium_Grip" },
  { name: "Barbell Squat", category: "Legs", popularity: 99, image: "Barbell_Squat" },
  { name: "Barbell Deadlift", category: "Back", popularity: 98, image: "Barbell_Deadlift" },
  { name: "Wide-Grip Lat Pulldown", category: "Back", popularity: 97, image: "Wide-Grip_Lat_Pulldown" },
  { name: "Dumbbell Shoulder Press", category: "Shoulders", popularity: 96, image: "Dumbbell_Shoulder_Press" },
  { name: "Dumbbell Bench Press", category: "Chest", popularity: 95, image: "Dumbbell_Bench_Press" },
  { name: "Incline Dumbbell Press", category: "Chest", popularity: 94, image: "Incline_Dumbbell_Press" },
  { name: "Seated Cable Row", category: "Back", popularity: 93, image: "Seated_Cable_Rows" },
  { name: "Leg Press", category: "Legs", popularity: 92, image: "Leg_Press" },
  { name: "Dumbbell Flyes", category: "Chest", popularity: 91, image: "Dumbbell_Flyes" },
  { name: "Romanian Deadlift", category: "Legs", popularity: 90, image: "Romanian_Deadlift" },
  { name: "Pull-up", category: "Back", popularity: 89, image: "Pull-Up" },
  { name: "Lying Leg Curl", category: "Legs", popularity: 88, image: "Lying_Leg_Curls" },
  { name: "Leg Extension", category: "Legs", popularity: 87, image: "Leg_Extensions" },
  { name: "Side Lateral Raise", category: "Shoulders", popularity: 86, image: "Side_Lateral_Raise" },
  { name: "Barbell Curl", category: "Arms", popularity: 85, image: "Barbell_Curl" },
  { name: "Hammer Curl", category: "Arms", popularity: 84, image: "Alternate_Hammer_Curl" },
  { name: "Triceps Pushdown", category: "Arms", popularity: 83, image: "Triceps_Pushdown" },
  { name: "Overhead Press", category: "Shoulders", popularity: 82, image: "Standing_Military_Press" },
  { name: "Face Pull", category: "Shoulders", popularity: 81, image: "Face_Pull" },
  { name: "Cable Crunch", category: "Core", popularity: 80, image: "Cable_Crunch" },
  { name: "Plank", category: "Core", popularity: 79, image: "Plank" },
  { name: "Hip Thrust", category: "Legs", popularity: 78, image: "Barbell_Hip_Thrust" },
  { name: "Front Squat", category: "Legs", popularity: 77, image: "Front_Barbell_Squat" },
  { name: "Goblet Squat", category: "Legs", popularity: 76, image: "Goblet_Squat" },
  { name: "Bulgarian Split Squat", category: "Legs", popularity: 75, image: "Bulgarian_Split_Squat" },
  { name: "Arnold Press", category: "Shoulders", popularity: 74, image: "Arnold_Dumbbell_Press" },
  { name: "Preacher Curl", category: "Arms", popularity: 73, image: "Preacher_Curl" },
  { name: "Skull Crusher", category: "Arms", popularity: 72, image: "EZ-Bar_Skullcrusher" },
  { name: "Standing Calf Raise", category: "Legs", popularity: 71, image: "Standing_Calf_Raise" },
  { name: "T-Bar Row", category: "Back", popularity: 70, image: "T-Bar_Row" },
  { name: "Dips", category: "Chest", popularity: 69, image: "Dips" },
  { name: "Decline Bench Press", category: "Chest", popularity: 68, image: "Decline_Bench_Press" },
  { name: "Incline Bench Press", category: "Chest", popularity: 67, image: "Incline_Bench_Press" },
  { name: "Cable Crossover", category: "Chest", popularity: 66, image: "Cable_Crossover" },
  { name: "Chest Dip", category: "Chest", popularity: 65, image: "Dips_-_Chest_Version" },
  { name: "Bent-Over Barbell Row", category: "Back", popularity: 64, image: "Bent_Over_Barbell_Row" },
  { name: "One-Arm Dumbbell Row", category: "Back", popularity: 63, image: "One-Arm_Dumbbell_Row" },
  { name: "Chin-up", category: "Back", popularity: 62, image: "Chin-Up" },
  { name: "Inverted Row", category: "Back", popularity: 61, image: "Inverted_Row" },
  { name: "Back Extension", category: "Back", popularity: 60, image: "Hyperextensions_(Back_Extensions)" },
  { name: "Good Morning", category: "Back", popularity: 59, image: "Good_Morning" },
  { name: "Hack Squat", category: "Legs", popularity: 58, image: "Hack_Squat" },
  { name: "Walking Lunge", category: "Legs", popularity: 57, image: "Dumbbell_Lunges" },
  { name: "Seated Leg Curl", category: "Legs", popularity: 56, image: "Seated_Leg_Curl" },
  { name: "Calf Press", category: "Legs", popularity: 55, image: "Calf_Press" },
  { name: "Reverse Flyes", category: "Shoulders", popularity: 54, image: "Reverse_Flyes" },
  { name: "Front Raise", category: "Shoulders", popularity: 53, image: "Front_Dumbbell_Raise" },
  { name: "Upright Row", category: "Shoulders", popularity: 52, image: "Upright_Barbell_Row" },
  { name: "Concentration Curl", category: "Arms", popularity: 51, image: "Concentration_Curls" },
  { name: "Incline Dumbbell Curl", category: "Arms", popularity: 50, image: "Incline_Dumbbell_Curl" },
  { name: "Close-Grip Bench Press", category: "Arms", popularity: 49, image: "Close-Grip_Barbell_Bench_Press" },
  { name: "Overhead Triceps Extension", category: "Arms", popularity: 48, image: "Dumbbell_One-Arm_Triceps_Extension" },
  { name: "Bench Dip", category: "Arms", popularity: 47, image: "Bench_Dips" },
  { name: "Wrist Curl", category: "Arms", popularity: 46, image: "Wrist_Circles" },
  { name: "Hanging Leg Raise", category: "Core", popularity: 45, image: "Hanging_Leg_Raise" },
  { name: "Ab Wheel Rollout", category: "Core", popularity: 44, image: "Ab_Roller" },
  { name: "Bicycle Crunch", category: "Core", popularity: 43, image: "Air_Bike" },
  { name: "Russian Twist", category: "Core", popularity: 42, image: "Russian_Twist" },
  { name: "Mountain Climber", category: "Core", popularity: 41, image: "Mountain_Climbers" },
  { name: "Reverse Crunch", category: "Core", popularity: 40, image: "Reverse_Crunch" },
  { name: "Sumo Deadlift", category: "Legs", popularity: 39, image: "Sumo_Deadlift" },
  { name: "Deficit Deadlift", category: "Back", popularity: 38, image: "Deficit_Deadlift" },
  { name: "Incline Dumbbell Flyes", category: "Chest", popularity: 37, image: "Incline_Dumbbell_Flyes" },
  { name: "Machine Chest Press", category: "Chest", popularity: 36, image: "Machine_Bench_Press" },
  { name: "Smith Machine Squat", category: "Legs", popularity: 35, image: "Smith_Machine_Squat" },
  { name: "Seated Dumbbell Shoulder Press", category: "Shoulders", popularity: 34, image: "Seated_Dumbbell_Press" },
  { name: "Cable Lateral Raise", category: "Shoulders", popularity: 33, image: "Cable_Lateral_Raise" },
  { name: "Cable Biceps Curl", category: "Arms", popularity: 32, image: "Cable_Curl" },
  { name: "Reverse-Grip Triceps Pushdown", category: "Arms", popularity: 31, image: "Reverse_Grip_Triceps_Pushdown" },
  { name: "Donkey Calf Raise", category: "Legs", popularity: 30, image: "Donkey_Calf_Raises" },
  { name: "Step-up", category: "Legs", popularity: 29, image: "Dumbbell_Step_Ups" },
  { name: "Glute Bridge", category: "Legs", popularity: 28, image: "Glute_Bridge" },
  { name: "Bird Dog", category: "Core", popularity: 27, image: "Bird_Dog" },
  { name: "Superman", category: "Back", popularity: 26, image: "Superman" },
  { name: "Push-up", category: "Chest", popularity: 25, image: "Push-Up" }
].map((item) => ({ ...item, id: item.image, image: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${item.image}/0.jpg` }));
const EXERCISE_DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const MUSCLE_CATEGORY: Record<string, string> = {
  chest: "Chest", pectorals: "Chest", lats: "Back", "middle back": "Back", "lower back": "Back", traps: "Back",
  shoulders: "Shoulders", deltoids: "Shoulders", biceps: "Arms", triceps: "Arms", forearms: "Arms",
  quadriceps: "Legs", hamstrings: "Legs", glutes: "Legs", calves: "Legs", abductors: "Legs", adductors: "Legs",
  abdominals: "Core", obliques: "Core",
};


const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORIES = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];

export const Route = createFileRoute("/_authenticated/workouts")({
  head: () => ({ meta: [{ title: "SPLIT — REPUNIT" }, { name: "description", content: "Build, save and share your training split." }] }),
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
  const [updatingVisibility, setUpdatingVisibility] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [category, setCategory] = useState("All");

  // Never keep an expanded plan from the previous signed-in account on screen.
  useEffect(() => {
    setExpanded(null);
  }, [user.id]);

  const exerciseDbQuery = useQuery({
    queryKey: ["repunit-exercise-library"],
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const response = await fetch(EXERCISE_DB_URL);
      if (!response.ok) throw new Error("Exercise library could not be loaded.");
      return await response.json() as ExerciseDbEntry[];
    },
  });

  const plansQuery = useQuery({
    queryKey: ["workout-plans", user.id],
    queryFn: async () => {
      const { data, error } = await db.from("workout_plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  // Subscription checks and plan limits stay dormant until paid plans launch.
  // All accounts can save workout plans without a billing lookup.

  const exercisesQuery = useQuery({
    queryKey: ["workout-plan-exercises", user.id, expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await db.from("workout_plan_exercises").select("*").eq("plan_id", expanded!).order("position");
      if (error) throw error;
      return (data ?? []) as PlanExercise[];
    },
  });

  const fullCatalog = useMemo(() => {
    const source = exerciseDbQuery.data;
    if (!source?.length) return CATALOG;
    const featured = CATALOG.flatMap((item) => {
      const match = source.find((exercise) => exercise.id === item.id);
      if (!match?.images?.[0]) return [];
      const muscle = (match.primaryMuscles ?? [])[0]?.toLowerCase() ?? "";
      return [{ name: match.name, category: MUSCLE_CATEGORY[muscle] ?? item.category, popularity: item.popularity, image: IMAGE_BASE + match.images[0] }];
    });
    const featuredNames = new Set(featured.map((item) => item.name));
    const additional = source
      .filter((exercise) => exercise.category === "strength" && exercise.images?.[0] && !featuredNames.has(exercise.name))
      .map((exercise) => {
        const muscle = (exercise.primaryMuscles ?? [])[0]?.toLowerCase() ?? "";
        return { name: exercise.name, category: MUSCLE_CATEGORY[muscle] ?? "Other", popularity: 0, image: IMAGE_BASE + exercise.images![0] };
      });
    return [...featured, ...additional];
  }, [exerciseDbQuery.data]);

  const filteredCatalog = useMemo(() => fullCatalog
    .filter((item) => category === "All" || item.category === category)
    .filter((item) => item.name.toLowerCase().includes(exerciseSearch.toLowerCase()))
    .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)), [fullCatalog, category, exerciseSearch]);

  function addExercise(name: string) {
    const setCount = Number(sets);
    const restSeconds = Number(rest);
    if (!Number.isInteger(setCount) || setCount < 1 || setCount > 30 || !reps.trim() || !Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 1800) {
      toast.error("Use 1–30 sets, enter reps and set rest between 0 and 1800 seconds.");
      return;
    }
    setDraftExercises((items) => [...items, { exercise_name: name, sets: setCount, reps: reps.trim(), rest_seconds: restSeconds }]);
    setPickerOpen(false);
    setExerciseSearch("");
  }

  async function createPlan() {
    if (plansQuery.isError) {
      toast.error("Workout limits could not be checked. Reload the page and try again.");
      return;
    }
    if (saving || title.trim().length < 2 || draftExercises.length === 0) {
      toast.error("Add a workout name and at least one exercise.");
      return;
    }
    setSaving(true);
    try {
      let planResult = await db.from("workout_plans").insert({
        user_id: user.id, title: title.trim(), workout_day: workoutDay, visibility,
      }).select("id").single();

      // If PostgREST has not refreshed the optional weekday column yet, retry
      // with the database default so saving a split is not blocked by its cache.
      if (planResult.error && /workout_day.*(schema cache|column)|column.*workout_day/i.test(planResult.error.message ?? "")) {
        planResult = await db.from("workout_plans").insert({
          user_id: user.id, title: title.trim(), visibility,
        }).select("id").single();
      }
      const { data: plan, error } = planResult;
      if (error) throw error;
      const { error: exerciseError } = await db.from("workout_plan_exercises").insert(
        draftExercises.map((item, index) => ({ ...item, plan_id: plan.id, position: index }))
      );
      if (exerciseError) {
        const { error: cleanupError } = await db.from("workout_plans").delete().eq("id", plan.id);
        if (cleanupError) throw new Error("The workout was created but could not be completed. Refresh the page before trying again.");
        throw exerciseError;
      }
      setTitle(""); setWorkoutDay("Monday"); setDraftExercises([]); setVisibility("private");
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success("SPLIT day saved.");
    } catch {
      toast.error("Could not save your workout. Check your connection and try again.");
    } finally { setSaving(false); }
  }

  async function updatePlanVisibility(plan: Plan, nextVisibility: Plan["visibility"]) {
    if (plan.visibility === nextVisibility || updatingVisibility) return;
    setUpdatingVisibility(plan.id);
    try {
      const { error } = await db.from("workout_plans")
        .update({ visibility: nextVisibility })
        .eq("id", plan.id)
        .eq("user_id", user.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success(nextVisibility === "public" ? "SPLIT is now public." : nextVisibility === "private" ? "SPLIT is now private." : "SPLIT is now visible to friends.");
    } catch {
      toast.error("Could not update SPLIT privacy. Please try again.");
    } finally {
      setUpdatingVisibility(null);
    }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm("Remove this SPLIT day?")) return;
    try {
      const { error } = await db.from("workout_plans").delete().eq("id", plan.id).eq("user_id", user.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success("Workout deleted.");
    } catch {
      toast.error("Could not delete this workout. Check your connection and try again.");
    }
  }

  const plans = plansQuery.data ?? [];
  return (
    <PageShell>
      <div className="mb-8">
        <p className="eyebrow">PLAN YOUR TRAINING</p>
        <h1 className="font-stat mt-2 text-6xl uppercase">SPLIT<span className="text-primary">.</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">Write your weekly SPLIT, choose training days and share it with friends.</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Build your weekly SPLIT</h2></div><div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{plans.length} SPLIT days saved</span></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Push day / Upper body" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day</label><select value={workoutDay} onChange={(e) => setWorkoutDay(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{DAYS.map((day) => <option key={day}>{day}</option>)}</select></div>
        </div>
        <div className="mt-3"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who can see this SPLIT?</label><select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"><option value="private">Private — only me</option><option value="public">Public — everyone</option><option value="followers">Friends</option></select></div>

        <div className="mt-6 rounded-xl border border-border bg-background/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Exercises</h3><p className="text-xs text-muted-foreground">Add exercises for this training day.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{draftExercises.length} added</span></div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div><label className="mb-1 block text-xs text-muted-foreground">Sets</label><Input value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" /></div>
            <div><label className="mb-1 block text-xs text-muted-foreground">Reps</label><Input value={reps} onChange={(e) => setReps(e.target.value)} maxLength={20} /></div>
            <div className="hidden" aria-hidden="true"><Input value={rest} onChange={(e) => setRest(e.target.value)} inputMode="numeric" /></div>
          </div>
          <Button type="button" variant="hero" className="w-full" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4" />Add exercise</Button>
          {draftExercises.length > 0 ? <ol className="mt-4 space-y-2">{draftExercises.map((item, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"><span className="min-w-0"><b>{i + 1}. {item.exercise_name}</b><span className="block text-xs text-muted-foreground">{item.sets} sets × {item.reps}</span></span><button onClick={() => setDraftExercises((all) => all.filter((_, index) => index !== i))} aria-label="Remove exercise" className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}</ol> : <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Your exercise list is empty. Tap “Add exercise” to get started.</p>}
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">This SPLIT day uses the privacy setting selected above.</p><Button variant="hero" disabled={saving || plansQuery.isLoading || plansQuery.isError} onClick={createPlan}>{saving ? "Saving…" : "Save SPLIT day"}</Button></div>
      </section>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border p-5 pb-3"><DialogTitle className="text-left text-xl">Exercise library</DialogTitle><p className="text-left text-sm text-muted-foreground">{exerciseDbQuery.isLoading ? "Loading exercise library…" : `${filteredCatalog.length} exercises · featured exercises first`}. Choose one to add it to your workout.</p></DialogHeader>
          <div className="space-y-3 px-5 pt-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={exerciseSearch} onChange={(e) => setExerciseSearch(e.target.value)} placeholder="Search exercises…" className="pl-9" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${category === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item}</button>)}</div>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto p-5 pt-2">
            {filteredCatalog.map((item) => <button key={item.name} onClick={() => addExercise(item.name)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition hover:border-primary/60 hover:bg-elevated">
              <div className="relative h-[76px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-muted"><img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.classList.remove("hidden"); e.currentTarget.nextElementSibling?.classList.add("flex"); }} /><div className="absolute inset-0 hidden items-center justify-center text-muted-foreground"><Dumbbell className="h-6 w-6" /></div></div>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.category}</span></span>
              <Plus className="mr-2 h-5 w-5 shrink-0 text-primary" />
            </button>)}
            {exerciseDbQuery.isError ? <div className="py-8 text-center"><p className="text-sm text-muted-foreground">The full exercise library could not be loaded. You can still use the built-in exercises below.</p><Button className="mt-3" size="sm" variant="line" onClick={() => void exerciseDbQuery.refetch()}>Try again</Button></div> : filteredCatalog.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{exerciseDbQuery.isLoading ? "Loading exercises…" : "No exercises found. Try another search."}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Your SPLIT</h2>
        {plansQuery.isLoading && !plansQuery.data ? <p className="text-muted-foreground">Loading SPLIT…</p> : plansQuery.isError && !plansQuery.data ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="font-semibold text-destructive">Your SPLIT could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again. Your saved SPLIT has not been changed.</p><Button className="mt-3" size="sm" variant="line" onClick={() => void plansQuery.refetch()}>Try again</Button></div> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><Dumbbell className="mx-auto mb-3 h-8 w-8" />No SPLIT yet. Create your first plan above.</div> : (
          <div className="grid gap-3 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{plan.title}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{plan.workout_day || "Monday"}</p></div><button onClick={() => void deletePlan(plan)} aria-label="Remove day" className="rounded-md p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-3">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Who can see this SPLIT?</label>
              <div className="flex items-center gap-2">
                {plan.visibility === "private" ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : plan.visibility === "public" ? <Globe className="h-4 w-4 shrink-0 text-primary" /> : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <select aria-label={`Privacy for ${plan.title}`} value={plan.visibility} disabled={updatingVisibility === plan.id || updatingVisibility !== null} onChange={(event) => void updatePlanVisibility(plan, event.target.value as Plan["visibility"])} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs font-semibold uppercase">
                  <option value="private">Private — only me</option>
                  <option value="public">Public — everyone</option>
                  <option value="followers">Friends</option>
                </select>
                {updatingVisibility === plan.id && <span className="text-[10px] text-muted-foreground">Saving…</span>}
              </div>
            </div>
            <Button className="mt-4 w-full" variant="line" onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}>{expanded === plan.id ? "Hide exercises" : "View exercises"}</Button>
            {expanded === plan.id && <div className="mt-3 space-y-2">{exercisesQuery.isLoading && !exercisesQuery.data ? <p className="text-sm text-muted-foreground">Loading exercises…</p> : exercisesQuery.isError && !exercisesQuery.data ? <div className="rounded-lg bg-background p-3"><p className="text-sm text-muted-foreground">Exercises could not be loaded.</p><Button className="mt-2" size="sm" variant="line" onClick={() => void exercisesQuery.refetch()}>Try again</Button></div> : (exercisesQuery.data ?? []).length === 0 ? <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground">No exercises in this SPLIT day yet.</p> : (exercisesQuery.data ?? []).map((ex, i) => <div key={ex.id} className="rounded-lg bg-background p-3 text-sm"><b>{i + 1}. {ex.exercise_name}</b><p className="text-muted-foreground">{ex.sets} sets × {ex.reps}</p></div>)}</div>}
          </article>)}</div>
        )}
      </section>
    </PageShell>
  );
}
