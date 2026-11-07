import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Clock3, Swords, Trophy, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";

function countdown(target:number,now:number) {
  const seconds=Math.max(0,Math.floor((target-now)/1000));
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
  return days? `${days}d ${hours}h ${minutes}m`:`${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${secs.toString().padStart(2,"0")}`;
}

export function LiveBattleCard({compact=false}:{compact?:boolean}) {
  const {user}=useUser();
  const navigate=useNavigate();
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const {data,isLoading,isError}=useQuery({
    queryKey:["home-live-battle",user?.id],
    enabled:!!user?.id,
    refetchInterval:15000,
    staleTime:10000,
    retry:2,
    retryDelay:(attempt)=>Math.min(1000*2**attempt,5000),
    queryFn:async()=>{
      const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id").eq("user_id",user!.id);
      if(memberError)throw memberError;
      const ids=[...new Set((members??[]).map((member:any)=>member.crew_id))];
      if(!ids.length)return null;
      const weeklySetup=await Promise.all(ids.map((crewId:string)=>(supabase as any).rpc("ensure_weekly_crew_battles",{_crew:crewId})));
      const setupError=weeklySetup.find((result:any)=>result.error)?.error;
      if(setupError)throw setupError;
      const {data:battles,error}=await (supabase as any).from("crew_battles")
        .select("id,challenger_crew_id,opponent_crew_id,category,starts_at,ends_at,status,is_weekly")
        .eq("is_weekly",true).in("status",["scheduled","active","pending"])
        .or(ids.map((id:string)=>`challenger_crew_id.eq.${id},opponent_crew_id.eq.${id}`).join(","))
        .order("starts_at",{ascending:false}).limit(10);
      if(error)throw error;
      const battle=(battles??[]).find((item:any)=>new Date(item.ends_at).getTime()>Date.now()||item.status==="pending");
      if(!battle)return null;
      const crewIds=[battle.challenger_crew_id,battle.opponent_crew_id];
      const [{data:crews,error:crewError},{data:crewMembers,error:crewMembersError}]=await Promise.all([
        (supabase as any).from("crews").select("id,name,emblem,accent_color").in("id",crewIds),
        (supabase as any).from("crew_members").select("crew_id,user_id").in("crew_id",crewIds),
      ]);
      if(crewError)throw crewError;
      if(crewMembersError)throw crewMembersError;
      const memberIds=[...new Set((crewMembers??[]).map((member:any)=>member.user_id))];
      const from=new Date(battle.starts_at).toISOString().slice(0,10);
      const to=new Date(battle.ends_at).toISOString().slice(0,10);
      let liftQuery=(supabase as any).from("lifts").select("user_id,weight_kg,reps,exercise")
        .in("user_id",memberIds.length?memberIds:["00000000-0000-0000-0000-000000000000"])
        .eq("status","VERIFIED").gte("lifted_on",from).lt("lifted_on",to);
      if(battle.category==="volume")liftQuery=liftQuery.in("exercise",["bench","squat","deadlift","ohp","pullup"]);
      else liftQuery=liftQuery.eq("exercise",battle.category);
      const {data:lifts,error:liftError}=await liftQuery;
      if(liftError)throw liftError;
      const scores=new Map<string,number>();
      for(const lift of lifts??[]){
        const member=(crewMembers??[]).find((item:any)=>item.user_id===lift.user_id);
        if(!member)continue;
        const score=battle.category==="volume"?Number(lift.weight_kg)*Number(lift.reps??1):Number(lift.weight_kg);
        scores.set(member.crew_id,(scores.get(member.crew_id)??0)+score);
      }
      return {
        battle,
        left:crews?.find((crew:any)=>crew.id===battle.challenger_crew_id)??null,
        right:crews?.find((crew:any)=>crew.id===battle.opponent_crew_id)??null,
        leftScore:scores.get(battle.challenger_crew_id)??0,
        rightScore:scores.get(battle.opponent_crew_id)??0,
      };
    }
  });
  const battle=data?.battle;
  const leftScore=data?.leftScore??0;
  const rightScore=data?.rightScore??0;
  const total=leftScore+rightScore;
  const leftPercent=total>0?leftScore/total*100:50;
  const open=()=>navigate({to:battle?"/battles/$id":"/battles",...(battle?{params:{id:battle.id}}:{})} as any);
  const compactClass=compact?"p-3 sm:p-4":"p-4 md:p-5";
  return <button type="button" onClick={open} className={`group relative block w-full overflow-hidden rounded-2xl border border-primary/30 bg-card text-left transition hover:border-primary/70 hover:shadow-[0_15px_45px_-20px_hsl(var(--primary)/.55)] active:scale-[.99] ${compactClass}`}>
    <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl"/>
    <div className="relative flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary"/>{battle?"Weekly battle":"Weekly battle"}</span>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Clock3 className="h-3 w-3"/>{battle?countdown(new Date(battle.status==="pending"?battle.starts_at:battle.ends_at).getTime(),now):"See matchups"}</span>
    </div>
    {isLoading?<div className="relative mt-3 grid grid-cols-3 items-center gap-2"><div className="h-10 animate-pulse rounded-lg bg-muted"/><div className="h-5 animate-pulse rounded bg-muted"/><div className="h-10 animate-pulse rounded-lg bg-muted"/></div>
    :isError?<div className="relative mt-3 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Battle status is temporarily unavailable.</p><span className="text-xs font-bold text-primary">Open battles</span></div>
    :battle?<div className="relative mt-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg">{data?.left?.emblem||"🏋️"}</span><span className="truncate text-xs font-black uppercase">{data?.left?.name||"Crew"}</span></div><p className="mt-1 pl-11 font-stat text-xl tabular-nums">{leftScore.toLocaleString()}<span className="ml-1 text-[10px] text-muted-foreground">kg</span></p></div>
        <div className="text-center"><Swords className="mx-auto h-4 w-4 text-primary"/><span className="font-stat text-xs text-muted-foreground">VS</span></div>
        <div className="min-w-0"><div className="flex items-center justify-end gap-2"><span className="truncate text-right text-xs font-black uppercase">{data?.right?.name||"Crew"}</span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg">{data?.right?.emblem||"🏋️"}</span></div><p className="mt-1 pr-11 text-right font-stat text-xl tabular-nums">{rightScore.toLocaleString()}<span className="ml-1 text-[10px] text-muted-foreground">kg</span></p></div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gradient-red transition-all duration-700" style={{width:`${leftPercent}%`}}/><div className="h-full bg-primary/60 transition-all duration-700" style={{width:`${100-leftPercent}%`}}/></div>
      <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{battle.category==="volume"?"Total verified volume":`${battle.category} strength`} · {battle.status==="pending"?"Awaiting rival": "Live score"}</p>
    </div>
    :<div className="relative mt-3 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background"><Trophy className="h-5 w-5 text-primary"/></span><div><p className="text-sm font-bold">No weekly battle yet</p><p className="text-xs text-muted-foreground">Explore crews and upcoming matchups.</p></div></div></div>}
    <div className="relative mt-3 flex items-center justify-between border-t border-border/80 pt-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground"><span>Verified lifts only</span><span className="inline-flex items-center gap-1 text-primary">Open battle <ArrowUpRight className="h-3 w-3"/></span></div>
  </button>;
}
