import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Flame, Share2, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ShareStoryButtonProps = {
  eyebrow: string;
  title: string;
  metric: string;
  unit?: string;
  detail?: string;
  filename?: string;
};

export function ShareStoryButton({ eyebrow, title, metric, unit = "", detail = "", filename = "repunit-story" }: ShareStoryButtonProps) {
  const [busy, setBusy] = useState(false);

  async function createImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
    bg.addColorStop(0, "#090909");
    bg.addColorStop(0.58, "#151010");
    bg.addColorStop(1, "#080808");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#ef3038";
    ctx.fillRect(72, 180, 12, 1560);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ef3038";
    ctx.beginPath();
    ctx.arc(930, 360, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 76px Arial";
    ctx.fillText("REPUNIT", 112, 260);
    ctx.fillStyle = "#ef4444";
    ctx.font = "700 30px Arial";
    ctx.fillText(eyebrow.toUpperCase().slice(0, 34), 112, 430);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 76px Arial";
    const words = title.toUpperCase().split(" ");
    let line = "";
    let y = 590;
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > 820 && line) {
        ctx.fillText(line, 112, y);
        y += 94;
        line = word;
      } else line = next;
    }
    if (line) ctx.fillText(line, 112, y);
    ctx.fillStyle = "#ef4444";
    ctx.font = "900 210px Arial";
    ctx.fillText(metric.slice(0, 12), 108, 1120);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 52px Arial";
    ctx.fillText(unit.toUpperCase().slice(0, 16), 112, 1205);
    ctx.fillStyle = "#b8b8b8";
    ctx.font = "500 34px Arial";
    const detailText = detail.slice(0, 70);
    ctx.fillText(detailText, 112, 1350);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 30px Arial";
    ctx.fillText("YOUR WORK. YOUR CREW. YOUR PROGRESS.", 112, 1660);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(112, 1710, 856, 4);
    ctx.fillStyle = "#777777";
    ctx.font = "500 24px Arial";
    ctx.fillText("REPUNIT.APP", 112, 1770);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("image")), "image/png");
    });
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await createImage();
      const file = new File([blob], filename + ".png", { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: "REPUNIT" });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename + ".png";
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Story image saved. Add it to Instagram Stories.");
      }
    } catch {
      toast.error("Could not create the share image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" onClick={() => void share()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/40 px-3 py-2 text-xs font-black uppercase tracking-wide text-primary transition hover:bg-primary/10 disabled:opacity-50">
    <Share2 className="h-4 w-4" />{busy ? "Preparing…" : "Share story"}
  </button>;
}

export function WeeklyStreakCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [freezing, setFreezing] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["weekly-training-streak", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("weekly_training_streaks")
        .select("current_weeks,longest_weeks,last_training_week,freeze_month")
        .eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: highlight } = useQuery({
    queryKey: ["share-lift-highlight", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lifts")
        .select("exercise,weight_kg,reps,lifted_on")
        .eq("user_id", userId).eq("status", "VERIFIED")
        .order("weight_kg", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function useFreeze() {
    setFreezing(true);
    try {
      const { data: result, error } = await (supabase as any).rpc("repunit_use_monthly_streak_freeze");
      if (error) throw error;
      if (!result?.applied) {
        toast.message(result?.reason === "already_used" ? "Your monthly freeze has already been used." : "A freeze is not needed right now.");
      } else {
        toast.success("Your weekly streak is protected. Take the time you need.");
        await qc.invalidateQueries({ queryKey: ["weekly-training-streak", userId] });
      }
    } catch {
      toast.error("Could not apply your streak freeze. Please try again.");
    } finally {
      setFreezing(false);
    }
  }

  if (isLoading) return <div className="h-28 animate-pulse rounded-2xl bg-card" />;
  const current = Number(data?.current_weeks ?? 0);
  const longest = Number(data?.longest_weeks ?? current);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  currentMonday.setDate(currentMonday.getDate() - (currentMonday.getDay() + 6) % 7);
  const currentWeek = `${currentMonday.getFullYear()}-${String(currentMonday.getMonth() + 1).padStart(2, "0")}-${String(currentMonday.getDate()).padStart(2, "0")}`;
  const expectedFreezeWeek = data?.last_training_week ? new Date(`${data.last_training_week}T00:00:00Z`) : null;
  if (expectedFreezeWeek) expectedFreezeWeek.setUTCDate(expectedFreezeWeek.getUTCDate() + 14);
  const freezeEligible = expectedFreezeWeek?.toISOString().slice(0, 10) === currentWeek;
  const freezeUsed = data?.freeze_month === monthStart;
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Flame className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1"><p className="eyebrow">CONSISTENCY, NOT PRESSURE</p><h2 className="font-stat text-2xl uppercase">Weekly streak</h2></div>
      <div className="text-right"><p className="font-stat text-3xl text-primary">{current}</p><p className="text-[9px] font-bold uppercase text-muted-foreground">weeks</p></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">{isError ? "Streak details are temporarily unavailable." : `Longest streak: ${longest} ${longest === 1 ? "week" : "weeks"}`}</p>
      <button type="button" onClick={() => void useFreeze()} disabled={freezing || freezeUsed || !freezeEligible} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50">
        <Snowflake className="h-4 w-4 text-primary" />{freezing ? "Applying…" : freezeUsed ? "Monthly freeze used" : freezeEligible ? "Use monthly freeze" : "Freeze available after a missed week"}
      </button>
    </div>
    <p className="mt-2 text-[10px] text-muted-foreground">Train at least once each week. One missed week can be protected each month. Rest is part of progress.</p>
    {highlight && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-widest text-primary">Lift highlight</p><p className="mt-1 font-stat text-xl uppercase">{String(highlight.exercise).replace("_", " ")} · {Number(highlight.weight_kg).toLocaleString()} kg</p><p className="text-[10px] text-muted-foreground">{highlight.reps} reps · {new Date(highlight.lifted_on).toLocaleDateString()}</p></div>
      <ShareStoryButton eyebrow="Verified lift" title={String(highlight.exercise).replace("_", " ")} metric={String(highlight.weight_kg)} unit="KG" detail={`${highlight.reps} reps · verified on REPUNIT`} filename="repunit-lift" />
    </div>}
  </section>;
}
