import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/app-shell";
import { useLeaderboard, Podium, RankList } from "@/components/leaderboard-list";
import { EXERCISES, type Exercise } from "@/lib/lifts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Ranks — REPUNIT" }, { name: "description", content: "Global strength rankings for lifters and crews." }, { property: "og:title", content: "Ranks — REPUNIT" }, { property: "og:description", content: "Who is the strongest?" }] }),
  component: Boards,
});

function useCrewRanks(exercise:Exercise|"total",since:string|null) {
  return useQuery({
    queryKey:["crew-global-ranks",exercise,since],
    queryFn:async()=>{
      const {data:crews,error:crewError}=await (supabase as any).from("crews").select("id,name,emblem,accent_color").order("name");
      if(crewError)throw crewError;
      if(!crews?.length)return [];
      const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id,user_id").in("crew_id",crews.map((c:any)=>c.id));
      if(memberError)throw memberError;
      const memberIds=[...new Set((members??[]).map((m:any)=>m.user_id))];
      if(!memberIds.length)return crews.map((crew:any)=>({...crew,total:0,contributors:0}));
      let query=(supabase as any).from("lifts").select("user_id,exercise,weight_kg").in("user_id",memberIds).eq("status","VERIFIED");
      if(exercise!=="total")query=query.eq("exercise",exercise);
      else query=query.in("exercise",["bench","squat","deadlift","ohp","pullup"]);
      if(since)query=query.gte("lifted_on",since);
      const {data:lifts,error:liftError}=await query;
      if(liftError)throw liftError;
      const best=new Map<string,number>();
      for(const lift of lifts??[]){
        const key=`${lift.user_id}:${exercise==="total"?lift.exercise:"selected"}`;
        best.set(key,Math.max(best.get(key)??0,Number(lift.weight_kg)));
      }
      const scores=new Map<string,{total:number;contributors:Set<string>}>();
      for(const member of members??[]){
        const score=scores.get(member.crew_id)??{total:0,contributors:new Set<string>()};
        const values=[...best.entries()].filter(([key])=>key.startsWith(member.user_id+":"));
        const memberTotal=values.reduce((sum,[,weight])=>sum+weight,0);
        if(memberTotal>0){score.total+=memberTotal;score.contributors.add(member.user_id);}
        scores.set(member.crew_id,score);
      }
      return crews.map((crew:any)=>({...crew,total:scores.get(crew.id)?.total??0,contributors:scores.get(crew.id)?.contributors.size??0}))
        .sort((a:any,b:any)=>b.total-a.total).filter((c:any)=>c.total>0);
    }
  });
}

function Boards() {
  const [tab,setTab]=useState<"lifters"|"crews">("lifters");
  const [ex, setEx] = useState<Exercise | "total">("total");
  const [range, setRange] = useState<"all" | "30" | "7">("all");
  const since = range === "all" ? null : new Date(Date.now() - Number(range) * 864e5).toISOString().slice(0, 10);
  const { data: rows = [], isLoading, isError, refetch } = useLeaderboard(ex, null, since);
  const {data:crewRows=[],isLoading:crewsLoading,isError:crewsError,refetch:refetchCrews}=useCrewRanks(ex,since);
  const meta = EXERCISES.find((e) => e.id === ex);
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:border-primary/50", on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground");
  return (
    <PageShell>
      <p className="eyebrow">GLOBAL STRENGTH</p>
      <h1 className="font-stat mt-2 text-6xl uppercase">Ranks</h1>
      <div className="mt-6 inline-flex rounded-xl border border-border bg-card p-1">
        <button onClick={()=>setTab("lifters")} className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-widest transition",tab==="lifters"?"bg-primary text-primary-foreground shadow-glow":"text-muted-foreground hover:text-foreground")}><Trophy className="h-4 w-4"/>Lifters</button>
        <button onClick={()=>setTab("crews")} className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-widest transition",tab==="crews"?"bg-primary text-primary-foreground shadow-glow":"text-muted-foreground hover:text-foreground")}><Users className="h-4 w-4"/>Crews</button>
      </div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {[{ id: "total" as const, short: "TOTAL" }, ...EXERCISES].map((e) => <Button key={e.id} variant="ghost" size="sm" className={chip(e.id === ex)} onClick={() => setEx(e.id)}>{e.short}</Button>)}
      </div>
      <div className="mt-2 flex gap-2">
        {([["all", "All time"], ["30", "Monthly"], ["7", "Weekly"]] as const).map(([k, l]) => <Button key={k} variant="ghost" size="sm" className={chip(range === k)} onClick={() => setRange(k)}>{l}</Button>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{tab==="lifters"?(ex === "total" ? "Combined total of each lifter’s best verified lifts across Bench, Squat, Deadlift, OHP and Pull-ups." : `Standard: ${meta?.standard} Ranked by heaviest weight, then reps.`):"Crew score = combined best verified lifts from every crew member in the selected category."}</p>
      {tab==="lifters"?<div className="mt-8 space-y-6">
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : isError ? <div><p>Could not load the leaderboard.</p><Button variant="line" className="mt-3" onClick={() => refetch()}>Try again</Button></div> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No lifts yet in this category.</p> : (<><Podium rows={rows.slice(0, 3)} />{rows.length > 3 && <RankList rows={rows.slice(3)} start={3} />}</>)}
      </div>:<div className="mt-8">
        {crewsLoading?<p className="text-muted-foreground">Loading crew ranks…</p>:crewsError?<div><p>Could not load crew rankings.</p><Button variant="line" className="mt-3" onClick={()=>refetchCrews()}>Try again</Button></div>:crewRows.length===0?<p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No verified crew lifts in this category yet.</p>:<div className="overflow-hidden rounded-2xl border border-border bg-card">{crewRows.map((crew:any,i:number)=><Link key={crew.id} to="/crews/$id" params={{id:crew.id}} className="group flex items-center gap-3 border-b border-border px-4 py-4 last:border-0 transition-all hover:bg-elevated active:bg-primary/10">
          <span className="font-stat w-8 text-2xl text-muted-foreground">{i+1}</span><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-2xl transition group-hover:scale-105">{crew.emblem||"🏋️"}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm font-black uppercase tracking-wide transition group-hover:text-primary">{crew.name}</b><span className="mt-1 block text-[10px] text-muted-foreground">{crew.contributors} contributing lifters</span></span><span className="font-stat text-2xl tabular-nums">{Math.round(crew.total).toLocaleString()}<small className="ml-1 text-xs text-muted-foreground">kg</small></span><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"/></Link>)}</div>}
      </div>}
    </PageShell>
  );
}
