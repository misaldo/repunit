// @ts-nocheck -- references backend features not yet set up; typed once their tables exist
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/app-shell";
import { useLeaderboard, Podium, RankList } from "@/components/leaderboard-list";
import { EXERCISES, type Exercise } from "@/lib/lifts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, ArrowUpRight, TrendingUp, TrendingDown, Minus, Crown, Swords, Globe2, MapPin } from "lucide-react";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Ranks — REPUNIT" }, { name: "description", content: "Global strength rankings for lifters and crews." }, { property: "og:title", content: "Ranks — REPUNIT" }, { property: "og:description", content: "Who is the strongest?" }] }),
  component: Boards,
});

type CrewRank = { id:string; name:string; emblem:string|null; accent_color:string|null; total:number; members:number; wins:number; movement:number; country_code:string|null };
type Period = "week"|"month"|"all";
type Region = "global"|"country";

function periodStart(period:Period) {
  const now=new Date();
  if(period==="all")return null;
  if(period==="month")return new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  const monday=new Date(now);monday.setHours(0,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  return monday.toISOString().slice(0,10);
}
async function scoreCrews(exercise:Exercise|"total",from:string|null,to:string|null) {
  const {data:crews,error}=await (supabase as any).from("crews").select("id,name").order("name");
  if(error)throw error;
  if(!crews?.length)return [];
  const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id,user_id,profiles(country_code)").in("crew_id",crews.map((c:any)=>c.id));
  if(memberError)throw memberError;
  const ids=[...new Set((members??[]).map((m:any)=>m.user_id))];
  let lifts:any[]=[];
  if(ids.length){
    let q=(supabase as any).from("lifts").select("user_id,exercise,weight_kg,reps,lifted_on").in("user_id",ids).eq("status","VERIFIED");
    if(exercise!=="total")q=q.eq("exercise",exercise);
    else q=q.in("exercise",["bench","squat","deadlift"]);
    if(from)q=q.gte("lifted_on",from);
    if(to)q=q.lt("lifted_on",to);
    const result=await q;if(result.error)throw result.error;lifts=result.data??[];
  }
  const totals=new Map<string,number>();
  for(const lift of lifts){
    const member=(members??[]).find((m:any)=>m.user_id===lift.user_id);
    if(!member)continue;
    totals.set(member.crew_id,(totals.get(member.crew_id)??0)+Number(lift.weight_kg)*Number(lift.reps??1));
  }
  const counts=new Map<string,number>();
  for(const member of members??[])counts.set(member.crew_id,(counts.get(member.crew_id)??0)+1);
  return crews.map((c:any)=>({...c,total:totals.get(c.id)??0,members:counts.get(c.id)??0,country_code:null as string|null}));
}
function useCrewRanks(exercise:Exercise|"total",period:Period,region:Region) {
  return useQuery({
    queryKey:["crew-ranks-v2",exercise,period,region],
    queryFn:async()=>{
      const from=periodStart(period);
      const [current,previous,battleResult,authResult]=await Promise.all([
        scoreCrews(exercise,from,null),
        scoreCrews(exercise,new Date(Date.now()-14*864e5).toISOString().slice(0,10),new Date(Date.now()-7*864e5).toISOString().slice(0,10)),
        (supabase as any).from("crew_battles").select("winner_crew_id").eq("status","completed").eq("is_weekly",true).not("winner_crew_id","is",null),
        supabase.auth.getUser(),
      ]);
      if(battleResult.error)throw battleResult.error;
      const userId=authResult.data.user?.id;
      const {data:myProfile}=userId?await (supabase as any).from("profiles").select("country_code").eq("id",userId).maybeSingle():{data:null};
      const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id,user_id,profiles(country_code)").in("crew_id",current.map((c:any)=>c.id));
      if(memberError)throw memberError;
      const prevRank=new Map(previous.sort((a:any,b:any)=>b.total-a.total).map((c:any,i:number)=>[c.id,i+1]));
      const wins=new Map<string,number>();
      for(const battle of battleResult.data??[])wins.set(battle.winner_crew_id,(wins.get(battle.winner_crew_id)??0)+1);
      const countryByCrew=new Map<string,string|null>();
      for(const member of members??[])if(member.profiles?.country_code&&!countryByCrew.has(member.crew_id))countryByCrew.set(member.crew_id,member.profiles.country_code);
      const ranked=current.map((c:any)=>({...c,country_code:countryByCrew.get(c.id)??null,wins:wins.get(c.id)??0}))
        .filter((c:any)=>region==="global"||(myProfile?.country_code&&members?.some((m:any)=>m.crew_id===c.id&&m.profiles?.country_code===myProfile.country_code)))
        .sort((a:any,b:any)=>b.total-a.total);
      return {rows:ranked.map((c:any,i:number)=>({...c,movement:(prevRank.get(c.id) as number|undefined)?(prevRank.get(c.id) as number)-(i+1):0})),myCrewIds:[...new Set((members??[]).filter((m:any)=>m.user_id===userId).map((m:any)=>m.crew_id))],countryCode:myProfile?.country_code??null};
    }
  });
}

function Boards() {
  const [tab,setTab]=useState<"lifters"|"crews">("lifters");
  const [ex,setEx]=useState<Exercise|"total">("total");
  const [period,setPeriod]=useState<Period>("all");
  const [region,setRegion]=useState<Region>("global");
  const since=period==="all"?null:periodStart(period);
  const {data:rows=[],isLoading,isError,refetch}=useLeaderboard(ex,null,since);
  const {data:crewData,isLoading:crewsLoading,isError:crewsError,refetch:refetchCrews}=useCrewRanks(ex,period,region);
  const crewRows:CrewRank[]=crewData?.rows??[];
  const ownRank=crewRows.findIndex(c=>crewData?.myCrewIds.includes(c.id))+1;
  const meta=EXERCISES.find(e=>e.id===ex);
  const chip=(on:boolean)=>cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:border-primary/50",on?"border-primary bg-primary/15 text-foreground":"border-border text-muted-foreground");
  const podiumColors=["border-yellow-400/50 bg-yellow-400/10 text-yellow-300","border-slate-300/40 bg-slate-300/10 text-slate-200","border-orange-500/40 bg-orange-500/10 text-orange-300"];
  return <PageShell>
    <p className="eyebrow">GLOBAL STRENGTH</p><h1 className="font-stat mt-2 text-6xl uppercase">Ranks</h1>
    <div className="mt-6 inline-flex rounded-xl border border-border bg-card p-1">
      <button onClick={()=>setTab("lifters")} className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-widest transition",tab==="lifters"?"bg-primary text-primary-foreground shadow-glow":"text-muted-foreground hover:text-foreground")}><Trophy className="h-4 w-4"/>Lifters</button>
      <button onClick={()=>setTab("crews")} className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-widest transition",tab==="crews"?"bg-primary text-primary-foreground shadow-glow":"text-muted-foreground hover:text-foreground")}><Users className="h-4 w-4"/>Crews</button>
    </div>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{[{id:"total" as const,short:"TOTAL"},...EXERCISES.filter(e=>["bench","squat","deadlift"].includes(e.id))].map(e=><Button key={e.id} variant="ghost" size="sm" className={chip(e.id===ex)} onClick={()=>setEx(e.id)}>{e.short}</Button>)}</div>
    <div className="mt-2 flex flex-wrap gap-2">{([["week","This week"],["month","This month"],["all","All time"]] as const).map(([k,l])=><Button key={k} variant="ghost" size="sm" className={chip(period===k)} onClick={()=>setPeriod(k)}>{l}</Button>)}</div>
    {tab==="crews"&&<div className="mt-3 flex gap-2">
      <Button size="sm" variant={region==="global"?"hero":"line"} onClick={()=>setRegion("global")}><Globe2 className="mr-1 h-3.5 w-3.5"/>Global</Button>
      <Button size="sm" variant={region==="country"?"hero":"line"} onClick={()=>setRegion("country")}><MapPin className="mr-1 h-3.5 w-3.5"/>Country</Button>
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">{tab==="lifters"?(ex==="total"?"Combined best verified lifts across the main strength disciplines.":`Standard: ${meta?.standard} Ranked by heaviest verified weight.`):"Crew tonnage = verified weight × reps from all crew members in the selected period."}</p>
    {tab==="lifters"?<div className="mt-8 space-y-6">{isLoading?<p className="text-muted-foreground">Loading…</p>:isError?<div><p>Could not load the leaderboard.</p><Button variant="line" className="mt-3" onClick={()=>refetch()}>Try again</Button></div>:rows.length===0?<p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No lifts yet in this category.</p>:<><Podium rows={rows.slice(0,3)}/>{rows.length>3&&<RankList rows={rows.slice(3)} start={3}/>}</>}</div>:
      <div className="mt-7">
        {crewsLoading?<p className="text-muted-foreground">Loading crew rankings…</p>:crewsError?<div><p>Could not load crew rankings.</p><Button variant="line" className="mt-3" onClick={()=>refetchCrews()}>Try again</Button></div>:region==="country"&&!crewData?.countryCode?<div className="rounded-2xl border border-dashed border-border p-7 text-center"><MapPin className="mx-auto h-7 w-7 text-muted-foreground"/><p className="mt-2 font-bold">Add your country to your profile</p><p className="mt-1 text-xs text-muted-foreground">Country rankings become available once your profile has a country set.</p><Link to="/settings" className="mt-3 inline-flex text-xs font-bold uppercase text-primary hover:underline">Edit profile</Link></div>:crewRows.length===0?<p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No verified crew lifts in this category yet.</p>:<>
          {ownRank>0&&<div className="mb-4 flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-3"><span className="text-xs font-black uppercase tracking-widest text-primary">Your crew is #{ownRank}</span><Crown className="h-4 w-4 text-primary"/></div>}
          {crewRows.length>=3&&<div className="mb-6 grid grid-cols-3 items-end gap-2">
            {[crewRows[1],crewRows[0],crewRows[2]].map((crew,i)=>{const place=i===1?1:i===0?2:3;return <Link key={crew.id} to="/crews/$id" params={{id:crew.id}} className={cn("group flex min-w-0 flex-col items-center rounded-2xl border p-2 text-center transition hover:-translate-y-1 hover:border-primary/50",podiumColors[place-1],place===1?"min-h-48 pt-4":"min-h-40 pt-3")} style={{borderColor:crew.accent_color??undefined}}>
              <span className="font-stat text-2xl">{place===1?<Crown className="mx-auto h-6 w-6"/>:place===2?"②":"③"}</span><span className="mt-2 flex h-12 w-12 items-center justify-center rounded-xl border border-current/20 bg-background/50 text-2xl">{crew.emblem||"🏋️"}</span><b className="mt-2 w-full truncate text-[10px] font-black uppercase group-hover:text-primary sm:text-xs">{crew.name}</b><span className="font-stat mt-1 text-lg">{Math.round(crew.total).toLocaleString()}</span><span className="text-[9px] uppercase opacity-70">kg volume</span>
            </Link>})}
          </div>}
          <div className="mb-2 grid grid-cols-[2.3rem_2.5rem_minmax(0,1fr)_auto] gap-2 px-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground"><span>#</span><span></span><span>Crew · members · wins</span><span className="text-right">Total kg</span></div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">{crewRows.map((crew,i)=>{const own=crewData?.myCrewIds.includes(crew.id);return <Link key={crew.id} to="/crews/$id" params={{id:crew.id}} className={cn("group grid grid-cols-[2.3rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3.5 transition last:border-0 hover:bg-elevated active:bg-primary/10",own&&"bg-primary/[0.08] ring-1 ring-inset ring-primary/35")}>
            <span className={cn("font-stat text-xl",own?"text-primary":"text-muted-foreground")}>{i+1}</span><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-xl transition group-hover:scale-105" style={{borderColor:crew.accent_color??undefined}}>{crew.emblem||"🏋️"}</span>
            <span className="min-w-0"><b className="block truncate text-xs font-black uppercase tracking-wide group-hover:text-primary">{crew.name}{own&&<span className="ml-1.5 text-[8px] text-primary">YOU</span>}</b><span className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] text-muted-foreground"><span>{crew.members} members</span><span className="inline-flex items-center gap-0.5"><Swords className="h-3 w-3"/> {crew.wins} wins</span></span></span>
            <span className="text-right"><b className="font-stat text-lg tabular-nums">{Math.round(crew.total).toLocaleString()}</b><span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">{crew.movement>0?<><TrendingUp className="h-3 w-3 text-emerald-400"/>+{crew.movement}</>:crew.movement<0?<><TrendingDown className="h-3 w-3 text-red-400"/>{crew.movement}</>:<><Minus className="h-3 w-3"/>—</>}<ArrowUpRight className="ml-1 h-3 w-3 group-hover:text-primary"/></span></span>
          </Link>})}</div>
        </>}
      </div>}
  </PageShell>;
}
