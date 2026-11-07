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
import { useUser } from "@/hooks/use-session";
import { Users, Trophy, TrendingUp, TrendingDown, Minus, Crown, Swords } from "lucide-react";
import { LiveBattleCard } from "@/components/live-battle-card";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "TOP — REPUNIT" }, { name: "description", content: "Global strength rankings for lifters and crews." }, { property: "og:title", content: "TOP — REPUNIT" }, { property: "og:description", content: "Who is the strongest?" }] }),
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
async function scoreCrewsLegacy(exercise:Exercise|"total",from:string|null,to:string|null) {
  const {data:crews,error}=await (supabase as any).from("crews").select("id,name,emblem,accent_color").order("name");
  if(error)throw error;
  if(!crews?.length)return [];
  const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id,user_id");
  if(memberError)throw memberError;
  const {data:authResult}=await supabase.auth.getUser();
  const userId=authResult.user?.id;
  let lifts:any[]=[];
  if(members?.length){
    let q=(supabase as any).from("lifts").select("user_id,exercise,weight_kg,reps,lifted_on").in("user_id",[...new Set(members.map((m:any)=>m.user_id))]).eq("status","VERIFIED");
    if(exercise!=="total")q=q.eq("exercise",exercise);
    else q=q.in("exercise",["bench","squat","deadlift"]);
    if(from)q=q.gte("lifted_on",from);
    if(to)q=q.lt("lifted_on",to);
    const result=await q;if(result.error)throw result.error;lifts=result.data??[];
  }
  const totals=new Map<string,number>();
  for(const lift of lifts){
    for(const member of members??[])if(member.user_id===lift.user_id)totals.set(member.crew_id,(totals.get(member.crew_id)??0)+Number(lift.weight_kg)*Number(lift.reps??1));
  }
  const counts=new Map<string,number>();
  for(const member of members??[])counts.set(member.crew_id,(counts.get(member.crew_id)??0)+1);
  return crews.map((crew:any)=>({...crew,total:totals.get(crew.id)??0,members:counts.get(crew.id)??0,wins:0,is_mine:(members??[]).some((member:any)=>member.crew_id===crew.id&&member.user_id===userId)}));
}

function useCrewRanks(exercise:Exercise|"total",period:Period,region:Region,enabled:boolean) {
  return useQuery({
    queryKey:["crew-ranks-rpc-v1",exercise,period,region],
    enabled,
    staleTime:30000,
    gcTime:5*60*1000,
    retry:2,
    retryDelay:(attempt)=>Math.min(1000*2**attempt,5000),
    placeholderData:(previousData)=>previousData,
    refetchOnWindowFocus:true,
    queryFn:async()=>{
      const from=periodStart(period);
      const previousFrom=new Date(Date.now()-14*864e5).toISOString().slice(0,10);
      const previousTo=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
      const [currentResult,previousResult]=await Promise.all([
        (supabase as any).rpc("crew_leaderboard",{_exercise:exercise,_from:from,_to:null}),
        (supabase as any).rpc("crew_leaderboard",{_exercise:exercise,_from:previousFrom,_to:previousTo}),
      ]);
      let current=currentResult.data??[];
      let previous=previousResult.data??[];
      const rpcMissing=[currentResult.error,previousResult.error].some((error:any)=>error && (error.code==="42883"||error.code==="PGRST202"||String(error.message??"").includes("crew_leaderboard")));
      if(currentResult.error||previousResult.error){
        if(!rpcMissing)throw currentResult.error??previousResult.error;
        const [legacyCurrent,legacyPrevious]=await Promise.all([
          scoreCrewsLegacy(exercise,from,null),
          scoreCrewsLegacy(exercise,previousFrom,previousTo),
        ]);
        current=legacyCurrent;
        previous=legacyPrevious;
      }
      const prevRank=new Map([...previous].sort((a:any,b:any)=>Number(b.total)-Number(a.total)).map((crew:any,i:number)=>[crew.id,i+1]));
      const ranked=[...current].sort((a:any,b:any)=>Number(b.total)-Number(a.total));
      return {
        rows:ranked.map((crew:any,i:number)=>({...crew,movement:(prevRank.get(crew.id) as number|undefined)?(prevRank.get(crew.id) as number)-(i+1):0})),
        myCrewIds:current.filter((crew:any)=>crew.is_mine).map((crew:any)=>crew.id),
        countryCode:null,
      };
    }
  });
}

function Boards() {
  const [tab,setTab]=useState<"lifters"|"crews"|"friends">("lifters");
  const [ex,setEx]=useState<Exercise|"total">("bench");
  const [period,setPeriod]=useState<Period>("all");
  const {user}=useUser();
  const since=periodStart(period);
  const audience=useQuery({
    queryKey:["leaderboard-audience","friends",user?.id],
    enabled:!!user?.id&&tab==="friends",
    staleTime:30000,
    retry:2,
    queryFn:async()=>{
      const {data:following,error:followingError}=await (supabase as any).from("follows").select("following_id").eq("follower_id",user!.id);
      if(followingError)throw followingError;
      const candidates=(following??[]).map((row:any)=>row.following_id);
      if(!candidates.length)return [user!.id];
      const {data:mutual,error:mutualError}=await (supabase as any).from("follows").select("follower_id").eq("following_id",user!.id).in("follower_id",candidates);
      if(mutualError)throw mutualError;
      return [...new Set([user!.id,...(mutual??[]).map((row:any)=>row.follower_id)])];
    },
  });
  const friendIds=tab==="friends"?(audience.data??[]):undefined;
  const {data:rows=[],isLoading,isError,isFetching,refetch}=useLeaderboard(ex,null,since,friendIds);
  const myRow=user?.id?rows.find((row:any)=>row.user_id===user.id):null;
  const myRank=myRow?(myRow.rank_position??rows.findIndex((row:any)=>row.user_id===user.id)+1):0;
  const {data:crewData,isLoading:crewsLoading,isError:crewsError,isFetching:crewsFetching,refetch:refetchCrews}=useCrewRanks(ex,period,"global",!!user?.id);
  const crewRows:CrewRank[]=crewData?.rows??[];
  const ownRank=crewRows.findIndex(c=>crewData?.myCrewIds.includes(c.id))+1;
  const meta=EXERCISES.find(e=>e.id===ex);
  const chip=(on:boolean)=>cn("min-h-10 shrink-0 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all hover:border-primary/50",on?"border-primary bg-primary/15 text-foreground":"border-border bg-card text-muted-foreground");
  const podiumColors=["border-yellow-400/50 bg-yellow-400/10 text-yellow-300","border-slate-300/40 bg-slate-300/10 text-slate-200","border-orange-500/40 bg-orange-500/10 text-orange-300"];
  const skeleton=<div className="space-y-3" aria-label="Loading leaderboard">{[0,1,2,3,4].map((n)=><div key={n} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="h-10 w-10 animate-pulse rounded-full bg-muted"/><div className="flex-1 space-y-2"><div className="h-3 w-1/3 animate-pulse rounded bg-muted"/><div className="h-2 w-1/2 animate-pulse rounded bg-muted"/></div><div className="h-6 w-16 animate-pulse rounded bg-muted"/></div>)}</div>;
  const tabButton=(value:"lifters"|"crews"|"friends",label:string,Icon:any)=><button key={value} type="button" onClick={()=>setTab(value)} aria-pressed={tab===value} className={cn("flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-wide transition",tab===value?"bg-primary text-primary-foreground shadow-glow":"text-muted-foreground hover:bg-elevated hover:text-foreground")}><Icon className="h-4 w-4"/>{label}</button>;
  return <PageShell>
    <div className="mb-3"><LiveBattleCard compact/></div>
    <Link to="/battles" className="mb-6 flex min-h-12 items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-black uppercase tracking-wide text-foreground transition hover:border-primary/50 hover:bg-elevated">
      <span className="flex items-center gap-2"><Swords className="h-4 w-4 text-primary"/>BATTLES <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground">All battles & challenges</span></span>
      <span className="text-primary">→</span>
    </Link>
    <p className="eyebrow">REPUNIT GLOBAL STRENGTH</p>
    <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="font-stat mt-1 text-5xl uppercase sm:text-6xl">TOP<span className="text-primary">.</span></h1>{tab==="crews"?<Button asChild variant="hero" className="min-h-11"><Link to="/crews/new">Create crew</Link></Button>:tab==="friends"?<Button asChild variant="hero" className="min-h-11"><Link to="/people">Find lifters</Link></Button>:<Button asChild variant="hero" className="min-h-11"><Link to="/records/new">Log a lift</Link></Button>}</div>
    <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1">{tabButton("lifters","Lifters",Trophy)}{tabButton("crews","Crews",Users)}{tabButton("friends","Friends",Users)}</div>
    <div className="mt-5 grid grid-cols-4 gap-2">
      {(["bench","squat","deadlift","total"] as const).map((value)=> <button key={value} type="button" aria-pressed={ex===value} onClick={()=>setEx(value)} className={chip(ex===value)}>{value==="total"?"Total":value[0].toUpperCase()+value.slice(1)}</button>)}
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      {([["week","Week"],["month","Month"],["all","All time"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={period===value} onClick={()=>setPeriod(value)} className={chip(period===value)}>{label}</button>)}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">{tab==="crews"?"Crews ranked by logged lifting volume in the selected period.":ex==="total"?"Combined best verified bench press, squat and deadlift results.":`Ranked by logged ${meta?.label.toLowerCase()??"lift"} weight.`}</p>
    {tab==="crews"?<div className="mt-6 space-y-5">
      {!user?<div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="font-semibold">Sign in to view crew rankings.</p><Button asChild variant="hero" className="mt-4"><Link to="/auth">Sign in</Link></Button></div>:crewsLoading&&!crewRows.length?skeleton:crewsError&&!crewRows.length?<div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="font-semibold">Crew rankings are temporarily unavailable.</p><p className="mt-1 text-sm text-muted-foreground">Your previous results will remain visible when available.</p><Button variant="line" className="mt-4" onClick={()=>void refetchCrews()}>Retry</Button></div>:crewRows.length===0?<div className="rounded-2xl border border-dashed border-border p-8 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 font-bold">No crew results yet</p><p className="mt-1 text-sm text-muted-foreground">Create or join a crew to start competing.</p><Button asChild variant="hero" className="mt-4"><Link to="/crews">Explore crews</Link></Button></div>:<>
        {crewsError&&<p className="text-xs text-muted-foreground">Showing the last available crew rankings. <button type="button" onClick={()=>void refetchCrews()} className="font-bold text-primary underline">Retry</button></p>}
        {crewsFetching&&!crewsError&&<p className="text-xs text-muted-foreground">Updating crew rankings…</p>}
        {ownRank>0&&<div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-3"><span className="text-xs font-black uppercase tracking-widest text-primary">Your crew is #{ownRank}</span><Crown className="h-4 w-4 text-primary"/></div>}
        {crewRows.length>=3&&<div className="grid grid-cols-3 items-end gap-2">{[crewRows[1],crewRows[0],crewRows[2]].map((crew,i)=>{const place=i===1?1:i===0?2:3;return <Link key={crew.id} to="/crews/$id" params={{id:crew.id}} className={cn("group flex min-w-0 flex-col items-center rounded-2xl border p-2 text-center transition hover:-translate-y-1 hover:border-primary/50",podiumColors[place-1],place===1?"min-h-44 pt-4":"min-h-36 pt-3")} style={{borderColor:crew.accent_color??undefined}}><span className="font-stat text-2xl">{place===1?<Crown className="mx-auto h-6 w-6"/>:place===2?"②":"③"}</span><span className="mt-2 flex h-11 w-11 items-center justify-center rounded-xl border border-current/20 bg-background/50 text-2xl">{crew.emblem||"🏋️"}</span><b className="mt-2 w-full truncate text-[10px] font-black uppercase">{crew.name}</b><span className="font-stat mt-1 text-lg">{Math.round(crew.total).toLocaleString()}</span><span className="text-[9px] uppercase opacity-70">kg volume</span></Link>})}</div>}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">{crewRows.map((crew,i)=>{const own=crewData?.myCrewIds.includes(crew.id);return <Link key={crew.id} to="/crews/$id" params={{id:crew.id}} className={cn("grid grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3.5 transition last:border-0 hover:bg-elevated",own&&"bg-primary/[0.08]")}><span className={cn("font-stat text-xl",own?"text-primary":"text-muted-foreground")}>{i+1}</span><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-xl" style={{borderColor:crew.accent_color??undefined}}>{crew.emblem||"🏋️"}</span><span className="min-w-0"><b className="block truncate text-xs font-black uppercase">{crew.name}{own&&<span className="ml-1.5 text-[8px] text-primary">YOU</span>}</b><span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground"><span>{crew.members} members</span><span className="inline-flex items-center gap-1"><Swords className="h-3 w-3"/>{crew.wins} wins</span></span></span><span className="text-right"><b className="font-stat text-lg tabular-nums">{Math.round(crew.total).toLocaleString()}</b><span className="block text-[9px] text-muted-foreground">kg volume</span><span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">{crew.movement>0?<><TrendingUp className="h-3 w-3"/>+{crew.movement}</>:crew.movement<0?<><TrendingDown className="h-3 w-3"/>{crew.movement}</>:<Minus className="h-3 w-3"/>}</span></span></Link>})}</div>
      </>}
    </div>:<div className="mt-6 space-y-6">
      {tab==="friends"&&!user?<div className="rounded-2xl border border-dashed border-border p-8 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 font-bold">Sign in to see your friends</p><Button asChild variant="hero" className="mt-4"><Link to="/auth">Sign in</Link></Button></div>
      :tab==="friends"&&audience.isLoading&&!audience.data?skeleton
      :tab==="friends"&&audience.isError&&!audience.data?<div className="rounded-2xl border border-border p-6 text-center"><p className="font-semibold">Friends could not be loaded yet.</p><Button variant="line" className="mt-3" onClick={()=>void audience.refetch()}>Retry</Button></div>
      :isLoading&&!rows.length?skeleton
      :isError&&!rows.length?<div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="font-semibold">TOP is temporarily unavailable.</p><p className="mt-1 text-sm text-muted-foreground">Please try again. Your previous results will appear automatically when available.</p><Button variant="line" className="mt-4" onClick={()=>void refetch()}>Retry</Button></div>
      :rows.length===0?<div className="rounded-2xl border border-dashed border-border p-8 text-center"><Trophy className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 font-bold">{tab==="friends"?"No friend lifts yet":"No PRs logged yet"}</p><p className="mt-1 text-sm text-muted-foreground">{tab==="friends"?"Follow lifters to build your friends leaderboard.":"Be the first to put a lift on TOP."}</p><Button asChild variant="hero" className="mt-4"><Link to={tab==="friends"?"/people":"/records/new"}>{tab==="friends"?"Find lifters":"Log your first lift"}</Link></Button></div>
      :<>
        {isError&&<p className="text-xs text-muted-foreground">Showing the last available results. <button type="button" onClick={()=>void refetch()} className="font-bold text-primary underline">Retry</button></p>}
        {isFetching&&!isError&&<p className="text-xs text-muted-foreground">Updating results…</p>}
        {myRank>0&&<div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-3"><span className="text-xs font-black uppercase tracking-widest text-primary">You are #{myRank}</span><Crown className="h-4 w-4 text-primary"/></div>}
        <Podium rows={rows.slice(0,3)} currentUserId={user?.id}/>
        {rows.length>3&&<RankList rows={rows.slice(3)} start={3} currentUserId={user?.id}/>}
      </>}
    </div>}
  </PageShell>;
}
