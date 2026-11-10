import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, UserPlus, UserCheck, Rss, Dumbbell, CalendarDays, Swords, Flame, Lock, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AvatarChip } from "@/components/avatar-chip";
import { StatusBadge } from "@/components/status-badge";
import { ProgressionCard } from "@/components/progression-card";
import { CosmeticWardrobe, CosmeticAvatar } from "@/components/social-retention";
import { useUser } from "@/hooks/use-session";
import { EXERCISES, exerciseLabel } from "@/lib/lifts";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: `@${params.username} — REPUNIT` }, { name: "description", content: `Lifting records and training activity of @${params.username}.` }, { property: "og:title", content: `@${params.username} on REPUNIT` }, { property: "og:description", content: "Personal records, community and training activity." }] }),
  component: Profile,
});

function Profile() {
  const { username } = Route.useParams();
  const { user } = useUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeExercise, setChallengeExercise] = useState("bench");
  const [challengeWeight, setChallengeWeight] = useState("100");

  const { data, isLoading, isError, error: profileError, refetch } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data: p, error } = await (supabase as any).from("profiles").select("id, username, display_name, bio, avatar_url, created_at, equipped_frame, equipped_name_color, equipped_title").eq("username", username.toLowerCase()).maybeSingle();
      if (error) throw error;
      if (!p) return null;
      const [{ data: lifts, error: liftsError }, { data: posts, error: postsError }] = await Promise.all([
        supabase.from("lifts").select("*").eq("user_id", p.id).order("lifted_on", { ascending: false }),
        supabase.from("posts").select("id, content, created_at").eq("user_id", p.id).order("created_at", { ascending: false }).limit(20),
      ]);
      // A profile must remain usable even if an optional activity query fails.
      // This also prevents an unavailable lifts table/permission from blanking the whole page.
      return {
        p,
        lifts: liftsError ? [] : (lifts ?? []),
        liftsError: liftsError?.message ?? null,
        posts: postsError ? [] : (posts ?? []),
      };
    },
  });

  useEffect(() => {
    if (isLoading || !data || window.location.hash !== "#training-split") return;
    document.getElementById("training-split")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLoading, data]);

  const { data: profileProgress = { xp: 0, current_streak: 0, longest_streak: 0, achievements: [] as string[] } } = useQuery({
    queryKey: ["profile-progression", data?.p.id], enabled: !!data?.p.id,
    queryFn: async () => {
      const [{ data: stats, error }, { data: achievementRows, error: achievementError }] = await Promise.all([
        (supabase as any).from("user_progress").select("xp,current_streak,longest_streak").eq("user_id", data!.p.id).maybeSingle(),
        (supabase as any).from("user_achievements").select("achievement_key").eq("user_id", data!.p.id),
      ]);
      if (error) throw error;
      if (achievementError) throw achievementError;
      return { xp: Number(stats?.xp ?? 0), current_streak: Number(stats?.current_streak ?? 0), longest_streak: Number(stats?.longest_streak ?? 0), achievements: (achievementRows ?? []).map((row: { achievement_key: string }) => row.achievement_key) };
    },
  });

  const { data: workoutPlans = [], isLoading: workoutPlansLoading, isError: workoutPlansError, refetch: refetchWorkoutPlans } = useQuery({
    queryKey: ["profile-workouts", data?.p.id, user?.id === data?.p.id],
    enabled: !!data?.p.id,
    queryFn: async () => {
      const { data: plans, error } = await (supabase as any).from("workout_plans")
        .select("id,title,workout_day,visibility,created_at")
        .eq("user_id", data!.p.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      let isFriend = false;
      if (user?.id && user.id !== data!.p.id) {
        const { data: friendStatus, error: friendStatusError } = await (supabase as any).rpc("friendship_status", { _other: data!.p.id });
        if (!friendStatusError) isFriend = Boolean(friendStatus?.is_friend);
        else if (friendStatusError.code === "42883" || friendStatusError.code === "PGRST202") {
          const [{ data: outgoing }, { data: incoming }] = await Promise.all([
            (supabase as any).from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", data!.p.id).maybeSingle(),
            (supabase as any).from("follows").select("follower_id").eq("follower_id", data!.p.id).eq("following_id", user.id).maybeSingle(),
          ]);
          isFriend = Boolean(outgoing && incoming);
        } else throw friendStatusError;
      }
      return (plans ?? []).filter((plan: { visibility: string }) => plan.visibility === "public" || (plan.visibility === "followers" && isFriend) || user?.id === data!.p.id);
    },
  });

  const workoutExercises = useQuery({
    queryKey: ["profile-workout-exercises", workoutPlans.map((plan: {id:string}) => plan.id)],
    enabled: workoutPlans.length > 0,
    queryFn: async () => {
      const { data: exercises, error } = await (supabase as any).from("workout_plan_exercises")
        .select("id,plan_id,exercise_name,sets,reps,rest_seconds,position")
        .in("plan_id", workoutPlans.map((plan: {id:string}) => plan.id))
        .order("position");
      if (error) throw error;
      return exercises ?? [];
    },
  });

  async function copyPlan(plan: { id: string; title: string; workout_day: string }) {
    if (!user || copyBusyId) return;
    if (workoutExercises.isLoading || workoutExercises.isError || !workoutExercises.data) {
      toast.error("The SPLIT exercises are not ready to copy. Try again in a moment.");
      return;
    }
    const items = workoutExercises.data.filter((exercise: any) => exercise.plan_id === plan.id);
    if (!items.length) {
      toast.error("This SPLIT has no exercises to copy yet.");
      return;
    }
    setCopyBusyId(plan.id);
    try {
      const { data: copied, error: planError } = await (supabase as any).from("workout_plans")
        .insert({ user_id: user.id, title: `${plan.title.slice(0, 70)} (copy)`, workout_day: plan.workout_day || "Monday", visibility: "private" })
        .select("id").single();
      if (planError) throw planError;
      const { error: exerciseError } = await (supabase as any).from("workout_plan_exercises").insert(
        items.map((exercise: any, index: number) => ({
          plan_id: copied.id, exercise_name: exercise.exercise_name, sets: exercise.sets,
          reps: exercise.reps, rest_seconds: exercise.rest_seconds, position: index,
        }))
      );
      if (exerciseError) {
        await (supabase as any).from("workout_plans").delete().eq("id", copied.id);
        throw exerciseError;
      }
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success("SPLIT copied to your library.");
    } catch {
      toast.error("Could not copy this SPLIT. Please try again.");
    } finally {
      setCopyBusyId(null);
    }
  }

  async function updatePlanVisibility(plan: { id: string; visibility: string }, nextVisibility: "private" | "public" | "followers") {
    if (!user || user.id !== data?.p.id || plan.visibility === nextVisibility || updatingVisibility) return;
    setUpdatingVisibility(plan.id);
    try {
      const { error } = await (supabase as any).from("workout_plans")
        .update({ visibility: nextVisibility })
        .eq("id", plan.id)
        .eq("user_id", user.id);
      if (error) throw error;
      await refetchWorkoutPlans();
      await qc.invalidateQueries({ queryKey: ["workout-plans", user.id] });
      toast.success(nextVisibility === "public" ? "SPLIT is now public." : nextVisibility === "private" ? "SPLIT is now private." : "SPLIT is now visible to friends.");
    } catch {
      toast.error("Could not update SPLIT privacy. Please try again.");
    } finally {
      setUpdatingVisibility(null);
    }
  }

  const { data: social, isError: socialError, refetch: refetchSocial } = useQuery({
    queryKey: ["profile-social", data?.p.id, user?.id],
    enabled: !!data?.p.id,
    queryFn: async () => {
      const profileId = data!.p.id;
      const [{ count: followers, error: followersError }, { count: following, error: followingError }, { data: relation, error: relationError }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profileId),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profileId),
        user && user.id !== profileId
          ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profileId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (followersError) throw followersError;
      if (followingError) throw followingError;
      if (relationError) throw relationError;

      let friendStatus: any = { is_friend: false, outgoing_request_id: null, incoming_request_id: null };
      if (user && user.id !== profileId) {
        const result = await (supabase as any).rpc("friendship_status", { _other: profileId });
        if (!result.error) friendStatus = result.data ?? friendStatus;
        else if (result.error.code === "42883" || result.error.code === "PGRST202") {
          const [{ data: outgoing }, { data: incoming }] = await Promise.all([
            supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profileId).maybeSingle(),
            supabase.from("follows").select("follower_id").eq("follower_id", profileId).eq("following_id", user.id).maybeSingle(),
          ]);
          friendStatus.is_friend = Boolean(outgoing && incoming);
        } else throw result.error;
      }
      return {
        followers: followers ?? 0,
        following: following ?? 0,
        isFollowing: !!relation,
        isFriend: Boolean(friendStatus.is_friend),
        outgoingRequestId: friendStatus.outgoing_request_id ?? null,
        incomingRequestId: friendStatus.incoming_request_id ?? null,
      };
    },
  });

  async function toggleFollow() {
    if (!user || !data || busy) return;
    setBusy(true);
    const result = social?.isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", data.p.id)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: data.p.id });
    if (result.error) toast.error("Could not update this follow. Check your connection and try again.");
    else {
      await Promise.all([refetchSocial(), qc.invalidateQueries({ queryKey: ["profile-social"] })]);
      toast.success(social?.isFollowing ? "Unfollowed" : "Following");
    }
    setBusy(false);
  }

  async function sendFriendRequest() {
    if (!user || !data || friendBusy) return;
    setFriendBusy(true);
    const { error } = await (supabase as any).rpc("send_friend_request", { _recipient: data.p.id });
    if (error) toast.error(error.message?.includes("already sent") ? "This person already sent you a request. Accept it below." : "Could not send friend request. Please try again.");
    else toast.success("Friend request sent.");
    await refetchSocial();
    setFriendBusy(false);
  }

  async function respondFriendRequest(accept: boolean) {
    if (!user || !social?.incomingRequestId || friendBusy) return;
    setFriendBusy(true);
    const { error } = await (supabase as any).rpc("respond_friend_request", { _request: social.incomingRequestId, _accept: accept });
    if (error) toast.error("Could not update this friend request. Please try again.");
    else toast.success(accept ? "You're now friends." : "Friend request ignored.");
    await refetchSocial();
    setFriendBusy(false);
  }

  async function removeFriend() {
    if (!user || !data || friendBusy) return;
    setFriendBusy(true);
    const { error } = await (supabase as any).rpc("remove_friend", { _other: data.p.id });
    if (error) toast.error("Could not remove this friend. Please try again.");
    else toast.success("Friend removed.");
    await refetchSocial();
    setFriendBusy(false);
  }

  async function sendChallenge() {
    if (!user || !data || !social?.isFriend || challengeBusy) return;
    const target = Number(challengeWeight);
    if (!Number.isFinite(target) || target <= 0 || target > 600) { toast.error("Enter a target between 0.5 and 600 kg."); return; }
    setChallengeBusy(true);
    const { error } = await (supabase as any).from("lifter_challenges").insert({
      challenger_id: user.id, challenged_id: data.p.id, exercise: challengeExercise,
      target_weight_kg: target, due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) toast.error("Could not send this challenge. Check your connection and try again.");
    else { toast.success("Challenge sent. Let the rivalry begin."); setChallengeOpen(false); setChallengeWeight("100"); }
    setChallengeBusy(false);
  }

  if (isLoading) return <PageShell><p className="text-muted-foreground">Loading…</p></PageShell>;
  if (isError && !data) return <PageShell><section className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8"><p className="eyebrow">PROFILE UNAVAILABLE</p><h1 className="mt-2 text-2xl font-bold">Could not load this profile.</h1><p className="mt-2 text-sm text-muted-foreground">{(profileError as { message?: string } | null)?.message ?? "Check your connection and try again."}</p><Button variant="line" className="mt-5" onClick={() => void refetch()}>Try again</Button></section></PageShell>;
  if (!data) return <PageShell><p>Lifter not found.</p></PageShell>;
  const { p, lifts, posts, liftsError } = data;
  const isOwnProfile = user?.id === p.id;
  const bestVerifiedPrs = lifts.filter((lift) => lift.status === "VERIFIED").reduce((best, lift) => {
    const exercise = lift.exercise as keyof typeof best;
    if (exercise in best) best[exercise] = Math.max(best[exercise], Number(lift.weight_kg) || 0);
    return best;
  }, { bench: 0, squat: 0, deadlift: 0 });

  return (
    <PageShell>
      <section className="profile-theme profile-theme-default rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <CosmeticAvatar userId={p.id} name={p.username} url={p.avatar_url} className="h-20 w-20 text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{p.display_name ?? p.username}</h1>
            <p className="text-sm text-muted-foreground">@{p.username} · joined {new Date(p.created_at).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
          {isOwnProfile ? (
            <>
              <Button asChild variant="line"><Link to="/settings">Edit profile</Link></Button>
            </>
          ) : user ? (
            <>
              <Button variant={social?.isFollowing ? "line" : "hero"} onClick={() => void toggleFollow()} disabled={busy || !social}>
                {social?.isFollowing ? <><UserCheck className="mr-2 h-4 w-4" />Following</> : <><UserPlus className="mr-2 h-4 w-4" />Follow</>}
              </Button>
              {social?.isFriend ? <Button variant="line" disabled={friendBusy} onClick={() => void removeFriend()}><Users className="mr-2 h-4 w-4"/>Remove friend</Button>
                : social?.incomingRequestId ? <><Button variant="hero" disabled={friendBusy} onClick={() => void respondFriendRequest(true)}>Accept request</Button><Button variant="line" disabled={friendBusy} onClick={() => void respondFriendRequest(false)}>Ignore</Button></>
                : social?.outgoingRequestId ? <Button variant="line" disabled>Request sent</Button>
                : <Button variant="hero" disabled={friendBusy || !social} onClick={() => void sendFriendRequest()}><UserPlus className="mr-2 h-4 w-4"/>Add friend</Button>}
            </>
          ) : (
            <Button asChild variant="hero"><Link to="/auth">Sign in to connect</Link></Button>
          )}
          {workoutPlans.length > 0 && <Button asChild variant="line"><a href="#training-split"><Dumbbell className="mr-2 h-4 w-4" />View SPLIT</a></Button>}
          {!isOwnProfile && user && social?.isFriend && <Button variant="hero" onClick={() => setChallengeOpen(v => !v)}><Swords className="mr-2 h-4 w-4"/>Challenge</Button>}
          </div>
        </div>
        {p.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6">{p.bio}</p>}
        {socialError && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Follow information could not be loaded.</span><button type="button" onClick={() => void refetchSocial()} className="font-semibold text-primary underline underline-offset-4">Try again</button></div>}
        {challengeOpen && <form onSubmit={e => { e.preventDefault(); void sendChallenge(); }} className="mt-5 grid gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lift</label><select value={challengeExercise} onChange={e=>setChallengeExercise(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">{EXERCISES.filter((x) => x.id !== "pullup").map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Target (kg)</label><input value={challengeWeight} onChange={e=>setChallengeWeight(e.target.value)} type="number" min="0.5" max="600" step="0.5" required className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/></div>
          <Button type="submit" disabled={challengeBusy}>{challengeBusy ? "Sending…" : "Send challenge"}</Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">They have 7 days to hit the target with a verified lift.</p>
        </form>}

        <div className="mt-5 flex flex-wrap gap-6 border-t border-border pt-4 text-sm">
          <div><strong className="text-foreground">{social?.followers ?? "—"}</strong> <span className="text-muted-foreground">followers</span></div>
          <div><strong className="text-foreground">{social?.following ?? "—"}</strong> <span className="text-muted-foreground">following</span></div>
          <div><strong className="text-foreground">{lifts.length}</strong> <span className="text-muted-foreground">lift records</span></div>
        </div>
      </section>

      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-muted-foreground"><Flame className="h-4 w-4 text-primary" />{profileProgress.current_streak} day streak</div>

      <div className="mt-4"><ProgressionCard xp={profileProgress.xp} streak={profileProgress.current_streak} longestStreak={profileProgress.longest_streak} bestPrs={bestVerifiedPrs} achievements={profileProgress.achievements} /></div>
      <div className="mt-4"><CosmeticWardrobe userId={data.p.id} /></div>

      <section id="training-split" className="mt-6 scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Dumbbell className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">SPLIT</h2></div>
        {workoutPlansLoading ? <p className="text-sm text-muted-foreground">Loading SPLIT…</p> : workoutPlansError && !workoutPlans.length ? <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">SPLIT could not be loaded.</p><Button className="mt-2" size="sm" variant="line" onClick={() => void refetchWorkoutPlans()}>Try again</Button></div> : workoutPlans.length === 0 ? <p className="text-sm text-muted-foreground">No public SPLIT shared yet.</p> : <div className="grid gap-3 sm:grid-cols-2">{workoutPlans.map((plan: {id:string;title:string;workout_day:string;visibility:string}) => { const items = (workoutExercises.data ?? []).filter((exercise: {plan_id:string}) => exercise.plan_id === plan.id); return <article key={plan.id} className="rounded-xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-bold">{plan.title}</h3><span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{plan.workout_day || "—"}</span></div>{isOwnProfile && <div className="mt-3"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Who can see this SPLIT?</label><div className="flex items-center gap-2">{plan.visibility === "private" ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : plan.visibility === "public" ? <Globe className="h-4 w-4 shrink-0 text-primary" /> : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}<select aria-label={`Privacy for ${plan.title}`} value={plan.visibility} disabled={updatingVisibility === plan.id || updatingVisibility !== null} onChange={(event) => void updatePlanVisibility(plan, event.target.value as "private" | "public" | "followers")} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs font-semibold uppercase"><option value="private">Private — only me</option><option value="public">Public — everyone</option><option value="followers">Friends</option></select>{updatingVisibility === plan.id && <span className="text-[10px] text-muted-foreground">Saving…</span>}</div></div>}{workoutExercises.isLoading ? <p className="mt-3 text-xs text-muted-foreground">Loading exercises…</p> : workoutExercises.isError && !workoutExercises.data ? <div className="mt-3"><p className="text-xs text-muted-foreground">Exercises could not be loaded.</p><Button className="mt-2" size="sm" variant="line" onClick={() => void workoutExercises.refetch()}>Try again</Button></div> : items.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No exercises in this workout.</p> : <ol className="mt-3 space-y-2">{items.map((exercise: {id:string;exercise_name:string;sets:number;reps:string;rest_seconds:number}, index:number) => <li key={exercise.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm"><span><span className="mr-2 text-xs text-muted-foreground">{index + 1}.</span>{exercise.exercise_name}</span><span className="shrink-0 text-xs text-muted-foreground">{exercise.sets} × {exercise.reps}</span></li>)}</ol>}{user && user.id !== p.id && <Button className="mt-4 w-full" variant="line" disabled={copyBusyId !== null || workoutExercises.isLoading || workoutExercises.isError} onClick={() => void copyPlan(plan)}>{copyBusyId === plan.id ? "Copying…" : "Copy to my SPLIT"}</Button>}</article>; })}</div>}
      </section>

      <div className="mt-8">
        <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Personal records</h2></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {EXERCISES.filter((e) => e.id !== "pullup").map((e) => {
            const best = lifts.filter((l) => l.exercise === e.id && l.status !== "REJECTED").sort((a, b) => Number(b.weight_kg) - Number(a.weight_kg))[0];
            return <div key={e.id} className="rounded-xl border border-border bg-card p-4">
              <p className="eyebrow">{e.short}</p>
              <p className="font-stat mt-2 text-4xl">{best ? Number(best.weight_kg) : "—"}<span className="text-sm text-muted-foreground">{best ? "kg" : ""}</span></p>
              {best && <StatusBadge status={best.status} className="mt-2" />}
            </div>;
          })}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xl font-bold">Recent lifts</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {liftsError ? <li className="p-4 text-sm text-muted-foreground"><p>Lift records are temporarily unavailable.</p><button type="button" onClick={() => void refetch()} className="mt-2 font-semibold text-primary underline underline-offset-4">Try again</button></li> : lifts.length === 0 && <li className="p-4 text-sm text-muted-foreground">No lifts yet.</li>}
            {lifts.slice(0, 10).map((l) => <li key={l.id}><Link to="/records/$id" params={{ id: l.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-elevated">
              <span><span className="font-semibold">{exerciseLabel(l.exercise)}</span><span className="ml-2 text-xs text-muted-foreground">{l.lifted_on}</span></span>
              <span className="flex items-center gap-2"><StatusBadge status={l.status} /><span className="font-stat text-xl">{Number(l.weight_kg)}×{l.reps}</span></span>
            </Link></li>)}
          </ul>
        </section>
        {false && <section>
          <div className="mb-3 flex items-center gap-2"><Rss className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Recent posts</h2></div>
          <div className="space-y-3">
            {posts.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No posts yet.</div>}
            {posts.map((post) => <article key={post.id} className="rounded-xl border border-border bg-card p-4">
              <p className="whitespace-pre-wrap text-sm leading-6">{post.content}</p>
              <p className="mt-3 text-xs text-muted-foreground">{new Date(post.created_at).toLocaleString()}</p>
            </article>)}
          </div>
        </section>}

      </div>
    </PageShell>
  );
}
