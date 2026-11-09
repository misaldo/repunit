import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Trophy, Swords, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";
import { AvatarChip } from "@/components/avatar-chip";
import { ShareStoryButton } from "@/components/streaks-share-cards";

const EXERCISES = ["bench", "squat", "deadlift", "ohp", "pullup"] as const;
const exerciseLabel: Record<string, string> = { bench: "Bench", squat: "Squat", deadlift: "Deadlift", ohp: "Overhead press", pullup: "Pull-up" };

export function WeekendEvents() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [title, setTitle] = useState("Squat Weekend");
  const [description, setDescription] = useState("A weekend to move your squat total up the leaderboard.");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [exercise, setExercise] = useState("squat");
  const [creating, setCreating] = useState(false);
  const { data: admin = false } = useQuery({
    queryKey: ["repunit-admin", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("user_roles").select("role").eq("user_id", user!.id).eq("role", "admin").maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["repunit-events"], staleTime: 30000, refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("repunit_events").select("id,title,description,starts_at,ends_at,exercise").order("starts_at", { ascending: true }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rankings = {} } = useQuery({
    queryKey: ["repunit-event-rankings", events.map((e: any) => e.id).join(",")],
    enabled: events.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(events.map(async (event: any) => {
        const { data, error } = await (supabase as any).rpc("repunit_event_leaderboard", { _event_id: event.id });
        if (error) throw error;
        return [event.id, data ?? []] as const;
      }));
      return Object.fromEntries(entries);
    },
  });
  async function createEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !starts || !ends || creating) return;
    setCreating(true);
    try {
      const { error } = await (supabase as any).rpc("admin_create_repunit_event", {
        _title: title.trim(), _description: description.trim(),
        _starts_at: new Date(starts).toISOString(), _ends_at: new Date(ends).toISOString(),
        _exercise: exercise === "all" ? null : exercise,
      });
      if (error) throw error;
      toast.success("Weekend event created.");
      await qc.invalidateQueries({ queryKey: ["repunit-events"] });
    } catch (error: any) { toast.error(error?.message || "Could not create event."); }
    finally { setCreating(false); }
  }
  return <section className="space-y-3">
    <div className="flex items-center justify-between"><div><p className="eyebrow">LIMITED-TIME COMPETITIONS</p><h2 className="font-stat mt-1 text-2xl uppercase">Weekend Events</h2></div><CalendarDays className="h-5 w-5 text-primary"/></div>
    {admin && <form onSubmit={createEvent} className="grid gap-2 rounded-2xl border border-primary/25 bg-card p-4 sm:grid-cols-2">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary sm:col-span-2"><ShieldCheck className="h-4 w-4"/> Admin · Create event</p>
      <input aria-label="Event title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Squat Weekend"/>
      <select aria-label="Event lift" value={exercise} onChange={e=>setExercise(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="all">All lifts · Volume</option>{EXERCISES.map(x=><option key={x} value={x}>{exerciseLabel[x]}</option>)}</select>
      <input aria-label="Event description" value={description} onChange={e=>setDescription(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2" placeholder="Description"/>
      <label className="text-xs text-muted-foreground">Starts<input required type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label>
      <label className="text-xs text-muted-foreground">Ends<input required type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label>
      <button disabled={creating} className="rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase text-primary-foreground disabled:opacity-50 sm:col-span-2">{creating ? "Creating…" : "Create event"}</button>
    </form>}
    {isLoading ? <div className="h-24 animate-pulse rounded-2xl bg-card"/> : isError ? <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Events are temporarily unavailable.</p> : events.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No events scheduled yet. Check back for the next REPUNIT weekend.</p> :
      <div className="grid gap-3 md:grid-cols-2">{events.map((event: any) => {
        const rows = (rankings as any)[event.id] ?? [];
        const joined = rows.some((row: any) => row.user_id === user?.id);
        return <article key={event.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-primary">{event.exercise ? exerciseLabel[event.exercise] : "All lifts"} · {new Date(event.ends_at) < new Date() ? "Completed" : new Date(event.starts_at) > new Date() ? "Upcoming" : "Live now"}</p><h3 className="mt-1 font-stat text-xl uppercase">{event.title}</h3><p className="mt-1 text-xs text-muted-foreground">{event.description}</p></div><Trophy className="h-5 w-5 shrink-0 text-primary"/></div>
          <p className="mt-3 text-[10px] font-semibold text-muted-foreground">{new Date(event.starts_at).toLocaleString()} — {new Date(event.ends_at).toLocaleString()}</p>
          <div className="mt-3 border-t border-border pt-2">{rows.slice(0,3).map((row: any,index: number)=><div key={row.user_id} className="flex items-center gap-2 py-1.5 text-xs"><span className="w-5 font-stat text-primary">#{index+1}</span><span className="min-w-0 flex-1 truncate font-semibold">@{row.username}</span><span className="font-stat">{Number(event.exercise ? row.best_kg : row.volume_kg).toLocaleString()} kg</span></div>)}{!rows.length && <p className="text-xs text-muted-foreground">Be the first to enter the leaderboard with a verified lift.</p>}</div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-primary">{joined ? "Participation badge earned" : "Verified lifts count automatically"}</p>
          {new Date(event.ends_at) < new Date() && rows[0] && <div className="mt-3"><ShareStoryButton eyebrow="Competition result" title={event.title} metric="WINNER" unit="REPUNIT" detail={`@${rows[0].username} · ${Number(event.exercise ? rows[0].best_kg : rows[0].volume_kg).toLocaleString()} kg`} filename="repunit-season-result" /></div>}
        </article>;
      })}</div>}
  </section>;
}

export function RivalryInbox() {
  const { user } = useUser();
  const qc = useQueryClient();
  const { data: rivals = [] } = useQuery({
    queryKey: ["repunit-rivalry-notifications", user?.id], enabled: !!user?.id, refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notifications").select("id,actor_id,title,body,created_at").eq("user_id",user!.id).eq("kind","challenge").order("created_at",{ascending:false}).limit(5);
      if(error) throw error;
      return (data ?? []).filter((n:any)=>n.actor_id && /passed your/.test(n.body));
    },
  });
  async function challengeBack(rivalId: string, body: string) {
    const exercise = EXERCISES.find(x => body.toLowerCase().includes(x)) ?? "bench";
    try {
      const { error } = await (supabase as any).rpc("repunit_challenge_back",{_rival_id:rivalId,_exercise:exercise});
      if(error) throw error;
      toast.success("Challenge sent. Time to take your record back.");
      await qc.invalidateQueries({queryKey:["repunit-rivalry-notifications",user?.id]});
    } catch(error:any) { toast.error(error?.message || "Could not send challenge."); }
  }
  if (!rivals.length) return null;
  return <section className="space-y-3"><div className="flex items-center gap-2"><Swords className="h-5 w-5 text-primary"/><h2 className="font-stat text-2xl uppercase">Your rivalries</h2></div>
    <div className="grid gap-2 sm:grid-cols-2">{rivals.map((item:any)=><article key={item.id} className="rounded-xl border border-primary/25 bg-primary/[.06] p-4"><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.body}</p><button type="button" onClick={()=>void challengeBack(item.actor_id,item.body)} className="mt-3 rounded-lg bg-primary px-3 py-2 text-[10px] font-black uppercase text-primary-foreground">Challenge back</button></article>)}</div>
  </section>;
}

export function CosmeticWardrobe({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey:["repunit-cosmetics",userId],
    queryFn:async()=>{
      const [{data:owned,error:ownedError},{data:catalog,error:catalogError},{data:profile,error:profileError}]=await Promise.all([
        (supabase as any).from("repunit_user_cosmetics").select("cosmetic_key,unlocked_at").eq("user_id",userId),
        (supabase as any).from("repunit_cosmetics").select("cosmetic_key,cosmetic_type,label,value"),
        (supabase as any).from("profiles").select("equipped_frame,equipped_name_color,equipped_title").eq("id",userId).single(),
      ]);
      if(ownedError) throw ownedError;if(catalogError) throw catalogError;if(profileError) throw profileError;
      const unlocked=new Set((owned??[]).map((x:any)=>x.cosmetic_key));
      return {items:(catalog??[]).filter((x:any)=>unlocked.has(x.cosmetic_key)),profile};
    },
  });
  async function equip(key:string) {
    const {error}=await (supabase as any).rpc("repunit_equip_cosmetic",{_cosmetic_key:key});
    if(error){toast.error(error.message || "Could not equip cosmetic.");return;}
    toast.success("Cosmetic equipped.");
    await qc.invalidateQueries({queryKey:["repunit-cosmetics",userId]});
    await qc.invalidateQueries({queryKey:["public-profile"]});
  }
  if(isLoading) return <div className="h-20 animate-pulse rounded-xl bg-card"/>;
  if(!data) return null;
  return <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary"/><h3 className="font-bold">Cosmetics</h3><span className="ml-auto text-[10px] text-muted-foreground">{data.items.length} unlocked</span></div>
    {(data.profile.equipped_title || data.profile.equipped_frame || data.profile.equipped_name_color) && <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-primary">{[data.profile.equipped_title, data.profile.equipped_frame && "Profile frame", data.profile.equipped_name_color && "Name color"].filter(Boolean).join(" · ")}</p>}
    {data.items.length ? <div className="grid gap-2 sm:grid-cols-2">{data.items.map((item:any)=><div key={item.cosmetic_key} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/60 p-3"><div className="min-w-0"><p className="text-xs font-bold">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.cosmetic_type.replace("_"," ")}</p></div><button type="button" onClick={()=>void equip(item.cosmetic_key)} className="rounded-lg border border-primary/30 px-3 py-1.5 text-[10px] font-black uppercase text-primary">Equip</button></div>)}</div> : <p className="text-xs text-muted-foreground">Unlock achievement rewards to collect profile frames, name colors and titles.</p>}
  </section>;
}


export function CosmeticName({ userId, username, displayName }: { userId: string; username: string; displayName?: string | null }) {
  const { data } = useQuery({
    queryKey: ["repunit-cosmetic-name", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles")
        .select("equipped_name_color,equipped_title").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
  });
  const color = data?.equipped_name_color === "#ef4444" ? "#ef4444" : data?.equipped_name_color === "#fbbf24" ? "#fbbf24" : undefined;
  return <span className="min-w-0"><span className="block truncate" style={color ? { color } : undefined}>{displayName || username}</span>{data?.equipped_title && <span className="block text-[9px] font-black uppercase tracking-wider text-primary">{data.equipped_title}</span>}</span>;
}


export function CosmeticAvatar({ userId, name, url, className }: { userId: string; name: string; url?: string | null; className?: string }) {
  const { data } = useQuery({
    queryKey: ["repunit-cosmetic-frame", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("equipped_frame").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
  });
  const frame = data?.equipped_frame;
  return <span className="inline-flex rounded-full p-[2px]" style={frame ? { boxShadow: `0 0 0 2px ${frame}, 0 0 12px ${frame}66` } : undefined}>
    <AvatarChip name={name} url={url} className={className || "h-9 w-9"} />
  </span>;
}
