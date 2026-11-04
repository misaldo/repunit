import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Swords, Trophy, Clock3, ShieldCheck, Zap, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Category = "bench" | "squat" | "deadlift";
type Battle = {
  id: string; challenger_crew_id: string; opponent_crew_id: string; category: Category;
  starts_at: string; ends_at: string; status: string; winner_crew_id: string | null;
  is_weekly: boolean; week_start: string | null;
};
type Crew = { id: string; name: string; emblem?: string | null; accent_color?: string | null };
type Contributor = { user_id: string; username: string; display_name: string | null; weight: number };

const categoryName: Record<Category, string> = { bench: "Bench press", squat: "Squat", deadlift: "Deadlift" };

function timeLeft(target: number, now: number) {
  const seconds = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return days ? `${days}d ${hours}h ${minutes}m` : `${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${secs.toString().padStart(2,"0")}`;
}

export function CrewBattles({ crewId, userId, isAdmin, focusBattleId }: { crewId: string; userId: string; isAdmin: boolean; focusBattleId?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [opponent, setOpponent] = useState("");
  const [category, setCategory] = useState<Category>("bench");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crew-battles", crewId, userId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { error: weeklyError } = await (supabase as any).rpc("ensure_weekly_crew_battles", { _crew: crewId });
      if (weeklyError) throw weeklyError;
      let { data: battles, error } = await (supabase as any).from("crew_battles")
        .select("id,challenger_crew_id,opponent_crew_id,category,starts_at,ends_at,status,winner_crew_id,is_weekly,week_start")
        .or(`challenger_crew_id.eq.${crewId},opponent_crew_id.eq.${crewId}`)
        .order("starts_at", { ascending: false }).limit(20);
      if (error) throw error;
      const expired = (battles ?? []).filter((b:Battle)=>!["pending","cancelled","completed"].includes(b.status)&&Date.now()>=new Date(b.ends_at).getTime());
      if (expired.length) {
        await Promise.all(expired.map((b:Battle)=>(supabase as any).rpc("complete_crew_battle",{_battle:b.id})));
        const refreshed = await (supabase as any).from("crew_battles").select("id,challenger_crew_id,opponent_crew_id,category,starts_at,ends_at,status,winner_crew_id,is_weekly,week_start").or(`challenger_crew_id.eq.${crewId},opponent_crew_id.eq.${crewId}`).order("starts_at",{ascending:false}).limit(20);
        if (refreshed.error) throw refreshed.error;
        battles = refreshed.data;
      }
      const ids = [...new Set((battles ?? []).flatMap((b: Battle) => [b.challenger_crew_id,b.opponent_crew_id]))];
      const [{ data: crews, error: crewError }, { data: rivalCrews, error: rivalError }] = await Promise.all([
        (supabase as any).from("crews").select("id,name").in("id", ids),
        (supabase as any).from("crews").select("id,name").neq("id",crewId).order("name"),
      ]);
      if (crewError) throw crewError;
      if (rivalError) throw rivalError;
      const crewMap = new Map((crews ?? []).map((c: Crew) => [c.id,c]));
      const adminCrews = (rivalCrews ?? []) as Crew[];
      const battleDetails = await Promise.all((battles ?? []).map(async (battle: Battle) => {
        const [leftMembersResult,rightMembersResult] = await Promise.all([
          (supabase as any).from("crew_members").select("user_id").eq("crew_id",battle.challenger_crew_id),
          (supabase as any).from("crew_members").select("user_id").eq("crew_id",battle.opponent_crew_id),
        ]);
        if (leftMembersResult.error) throw leftMembersResult.error;
        if (rightMembersResult.error) throw rightMembersResult.error;
        const leftMembers = leftMembersResult.data ?? [];
        const rightMembers = rightMembersResult.data ?? [];
        const allMembers = [...leftMembers,...rightMembers];
        const memberIds = [...new Set(allMembers.map((m:any)=>m.user_id))];
        const { data: profileRows, error: profileError } = memberIds.length
          ? await (supabase as any).from("profiles").select("id,username,display_name").in("id",memberIds)
          : { data: [], error: null };
        if (profileError) throw profileError;
        const profilesById = new Map((profileRows ?? []).map((p:any)=>[p.id,p]));
        const withProfiles = (members:any[]) => members.map((m:any)=>({...m,profiles:profilesById.get(m.user_id)??null}));
        const from = battle.starts_at.slice(0,10);
        const to = battle.ends_at.slice(0,10);
        const { data: lifts, error: liftError } = await (supabase as any).from("lifts")
          .select("user_id,weight_kg").in("user_id",memberIds.length?memberIds:["00000000-0000-0000-0000-000000000000"])
          .eq("exercise",battle.category).eq("status","VERIFIED")
          .gte("lifted_on",from).lt("lifted_on",to);
        if (liftError) throw liftError;
        const best = new Map<string,number>();
        for (const lift of lifts ?? []) best.set(lift.user_id,Math.max(best.get(lift.user_id) ?? 0,Number(lift.weight_kg)));
        const makeSide = (members:any[]) => {
          const contributors: Contributor[] = members.map((m:any)=>({
            user_id:m.user_id, username:m.profiles?.username ?? "lifter",
            display_name:m.profiles?.display_name ?? null, weight:best.get(m.user_id) ?? 0,
          })).filter((m:Contributor)=>m.weight>0).sort((a:Contributor,b:Contributor)=>b.weight-a.weight);
          return { total:contributors.reduce((sum,m)=>sum+m.weight,0), contributors:contributors.slice(0,3) };
        };
        return { battle, left:crewMap.get(battle.challenger_crew_id), right:crewMap.get(battle.opponent_crew_id), leftScore:makeSide(withProfiles(leftMembers)), rightScore:makeSide(withProfiles(rightMembers)) };
      }));
      return { battles:battleDetails, adminCrews };
    },
  });

  const visibleBattles = data?.battles.filter(({battle}) => !focusBattleId || battle.id === focusBattleId) ?? [];
  const current = visibleBattles.filter(({battle}) => battle.status === "pending" || (battle.status !== "cancelled" && now < new Date(battle.ends_at).getTime()));
  const history = visibleBattles.filter(({battle}) => battle.status === "completed" || battle.status === "cancelled" || now >= new Date(battle.ends_at).getTime());

  async function refresh() {
    await qc.invalidateQueries({ queryKey:["crew-battles",crewId,userId] });
    await qc.invalidateQueries({ queryKey:["crew",crewId] });
  }
  async function challenge() {
    if (!opponent || busy) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("challenge_crew",{_challenger:crewId,_opponent:opponent,_category:category});
      if (error) throw error;
      toast.success("Crew challenge sent");
      setOpponent("");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send challenge"); }
    finally { setBusy(false); }
  }
  async function respond(id:string, accept:boolean) {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("respond_crew_battle",{_battle:id,_accept:accept});
      if (error) throw error;
      toast.success(accept ? "Battle accepted — let's go!" : "Challenge declined");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not respond to challenge"); }
    finally { setBusy(false); }
  }

  const card = (item: NonNullable<typeof data>["battles"][number], past=false) => {
    const {battle,left,right,leftScore,rightScore}=item;
    const leftTotal=leftScore.total, rightTotal=rightScore.total, max=Math.max(leftTotal,rightTotal,1);
    const leftWon=battle.winner_crew_id ? battle.winner_crew_id===battle.challenger_crew_id : past && leftTotal>rightTotal;
    const rightWon=battle.winner_crew_id ? battle.winner_crew_id===battle.opponent_crew_id : past && rightTotal>leftTotal;
    const isPending=battle.status==="pending";
    const isEnded=past;
    const target=new Date(battle.ends_at).getTime();
    return <article key={battle.id} role="link" tabIndex={0} onClick={()=>navigate({to:"/battles/$id",params:{id:battle.id}})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();navigate({to:"/battles/$id",params:{id:battle.id}});}}} className={`relative cursor-pointer overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 active:scale-[.995] ${isEnded?"border-border bg-card/70":"border-primary/30 bg-card shadow-[0_0_35px_-18px_hsl(var(--primary)/.35)]"} p-4 md:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-primary"><Swords className="h-3.5 w-3.5"/>{battle.is_weekly?"Weekly battle":"Crew challenge"}<span className="text-muted-foreground">· {categoryName[battle.category]}</span></div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">{isPending?"Awaiting response":isEnded?"Finished":"Live"}</span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-5">
        {[{crew:left,total:leftTotal,won:leftWon},{crew:right,total:rightTotal,won:rightWon}].map((side,i)=><div key={i} className={`min-w-0 text-center ${side.won?"text-primary":""}`}>
          <Link to="/crews/$id" params={{id:side.crew?.id??""}} onClick={e=>e.stopPropagation()} className="group/crew inline-flex max-w-full flex-col items-center rounded-xl p-1 transition hover:bg-elevated active:scale-95"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-elevated text-2xl transition group-hover/crew:border-primary/50">{side.crew?.emblem||"🏋️"}</div><p className="mt-2 max-w-full truncate text-xs font-black uppercase tracking-wide transition group-hover/crew:text-primary md:text-sm">{side.crew?.name??"Crew"}</p></Link>
          <p className="font-stat mt-1 text-3xl md:text-4xl">{side.total.toLocaleString("en-US")}<span className="ml-1 text-xs text-muted-foreground">kg</span></p>
          {side.won&&<span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase text-primary"><Trophy className="h-3 w-3"/>Winner</span>}
        </div>)}
        <div className="col-start-2 row-start-1 text-center"><span className="font-stat text-xl text-muted-foreground">VS</span></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{width:`${leftTotal/max*100}%`}}/></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{width:`${rightTotal/max*100}%`}}/></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {[leftScore.contributors,rightScore.contributors].map((list,i)=><div key={i}><p className="mb-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Top contributors</p>{list.length?list.map((p,n)=><Link key={p.user_id} to="/u/$username" params={{username:p.username}} onClick={e=>e.stopPropagation()} className="flex items-center justify-between gap-2 rounded-md py-1 text-xs transition hover:bg-elevated hover:text-primary"><span className="truncate"><span className="mr-1 text-primary">{n+1}.</span>{p.display_name||p.username}</span><b className="shrink-0 tabular-nums">{p.weight} kg</b></Link>):<p className="text-xs text-muted-foreground">No verified lifts yet</p>}</div>)}
      </div>
      {isPending && battle.opponent_crew_id===crewId && isAdmin && <div className="mt-4 flex gap-2 border-t border-border pt-3"><Button size="sm" variant="hero" disabled={busy} onClick={e=>{e.stopPropagation();respond(battle.id,true)}}><Check className="mr-1 h-3.5 w-3.5"/>Accept battle</Button><Button size="sm" variant="line" disabled={busy} onClick={e=>{e.stopPropagation();respond(battle.id,false)}}><X className="mr-1 h-3.5 w-3.5"/>Decline</Button></div>}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{isEnded ? (leftWon||rightWon?"Victory secured":"Battle ended in a draw") : isPending?"Waiting for the rival crew":"Time remaining"}</span>
        {!isEnded&&!isPending&&<span className="inline-flex items-center gap-1.5 text-primary tabular-nums"><Clock3 className="h-3 w-3"/>{timeLeft(target,now)}</span>}
        {isEnded&&(leftWon||rightWon)&&<span className="inline-flex items-center gap-1 text-primary"><ShieldCheck className="h-3.5 w-3.5"/>Crew badge earned</span>}
      </div>
      {isEnded&&(leftWon||rightWon)&&<div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-primary animate-pulse"><Trophy className="h-4 w-4"/> {leftWon?left?.name:right?.name} wins the battle!</div>}
    </article>;
  };

  return <section className="mt-10">
    <div className="flex items-end justify-between gap-3"><div><p className="eyebrow text-primary">THE WEEKLY SHOWDOWN</p><h2 className="font-stat mt-1 text-3xl uppercase">Crew battles</h2><p className="mt-1 text-xs text-muted-foreground">Verified lifts only · One category every week</p></div><Swords className="mb-1 h-6 w-6 text-primary"/></div>
    {isAdmin&&data?.adminCrews.length>0&&<div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-black uppercase tracking-widest">Challenge a crew</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select value={opponent} onChange={e=>setOpponent(e.target.value)} className="h-11 min-w-0 rounded-xl border border-border bg-background px-3 text-sm"><option value="">Choose rival crew</option>{data.adminCrews.map((c:Crew)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={category} onChange={e=>setCategory(e.target.value as Category)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm">{(["bench","squat","deadlift"] as Category[]).map(c=><option key={c} value={c}>{categoryName[c]}</option>)}</select>
        <Button variant="hero" disabled={!opponent||busy} onClick={challenge}><Zap className="mr-1 h-4 w-4"/>Challenge</Button>
      </div>
    </div>}
    {isLoading?<p className="mt-5 text-sm text-muted-foreground">Loading battles…</p>:isError?<p className="mt-5 text-sm text-muted-foreground">Could not load crew battles. The battles database update may need to be applied first.</p>:<>
      <div className="mt-5 space-y-4">{current.length?current.map(x=>card(x)): <div className="rounded-2xl border border-dashed border-border p-6 text-center"><Swords className="mx-auto h-7 w-7 text-muted-foreground"/><p className="mt-2 text-sm font-bold">No active battles yet</p><p className="mt-1 text-xs text-muted-foreground">Weekly matchups are paired automatically. You can also challenge another crew above.</p></div>}</div>
      {history.length>0&&<div className="mt-8"><p className="eyebrow">PAST SHOWDOWNS</p><h3 className="font-stat mt-1 text-2xl uppercase">Battle history</h3><div className="mt-3 space-y-3">{history.map(x=>card(x,true))}</div></div>}
    </>}
  </section>;
}
