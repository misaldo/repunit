import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Clock3, Swords, Trophy, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";

function countdown(target:number,now:number) {
  const s=Math.max(0,Math.floor((target-now)/1000));
  const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;
  return d?`${d}d ${h}h ${m}m`:`${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
}
export function LiveBattleCard() {
  const {user}=useUser();
  const navigate=useNavigate();
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[]);
  const {data,isLoading}=useQuery({
    queryKey:["home-live-battle",user?.id],
    enabled:!!user?.id,
    refetchInterval:15000,
    queryFn:async()=>{
      const {data:members,error:memberError}=await (supabase as any).from("crew_members").select("crew_id").eq("user_id",user!.id);
      if(memberError)throw memberError;
      const ids=(members??[]).map((m:any)=>m.crew_id);
      if(!ids.length)return null;
      const {data:battles,error}=await (supabase as any).from("crew_battles").select("id,challenger_crew_id,opponent_crew_id,category,starts_at,ends_at,status,is_weekly").in("status",["scheduled","active","pending"]).or(ids.map((id:string)=>`challenger_crew_id.eq.${id},opponent_crew_id.eq.${id}`).join(",")).order("starts_at",{ascending:true}).limit(10);
      if(error)throw error;
      const battle=(battles??[]).find((b:any)=>b.status==="pending"||new Date(b.ends_at).getTime()>Date.now());
      if(!battle)return null;
      const crewIds=[battle.challenger_crew_id,battle.opponent_crew_id];
      const {data:crews,error:crewError}=await (supabase as any).from("crews").select("id,name,emblem").in("id",crewIds);
      if(crewError)throw crewError;
      return {battle,crews:crews??[]};
    }
  });
  const battle=data?.battle;
  const left=data?.crews.find((c:any)=>c.id===battle?.challenger_crew_id);
  const right=data?.crews.find((c:any)=>c.id===battle?.opponent_crew_id);
  return <div role="link" tabIndex={0} onClick={()=>battle?navigate({to:"/battles/$id",params:{id:battle.id}}):navigate({to:"/battles"})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();battle?navigate({to:"/battles/$id",params:{id:battle.id}}):navigate({to:"/battles"});}}} className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-primary/30 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-[0_15px_45px_-20px_hsl(var(--primary)/.55)] active:scale-[.99] md:p-5">
    <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl transition group-hover:bg-primary/20"/>
    <div className="relative flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"/>Live battle</span><span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Clock3 className="h-3 w-3"/>{battle&&battle.status!=="pending"?countdown(new Date(battle.ends_at).getTime(),now):"Awaiting rival"}</span></div>
    {isLoading?<p className="relative mt-5 text-sm text-muted-foreground">Finding your battle…</p>:battle?<div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="min-w-0 text-center"><Link to="/crews/$id" params={{id:left?.id??""}} onClick={e=>e.stopPropagation()} className="inline-flex flex-col items-center rounded-xl p-1 transition hover:bg-elevated"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-2xl">{left?.emblem||"🏋️"}</span><p className="mt-2 truncate text-xs font-black uppercase hover:text-primary">{left?.name||"Crew"}</p></Link></div>
      <div className="text-center"><Swords className="mx-auto h-5 w-5 text-primary"/><p className="font-stat mt-1 text-lg text-muted-foreground">VS</p><p className="text-[8px] font-black uppercase tracking-widest text-primary">{battle.category}</p></div>
      <div className="min-w-0 text-center"><Link to="/crews/$id" params={{id:right?.id??""}} onClick={e=>e.stopPropagation()} className="inline-flex flex-col items-center rounded-xl p-1 transition hover:bg-elevated"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-2xl">{right?.emblem||"🏋️"}</span><p className="mt-2 truncate text-xs font-black uppercase hover:text-primary">{right?.name||"Crew"}</p></Link></div>
    </div>:<div className="relative mt-4 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background"><Trophy className="h-5 w-5 text-primary"/></span><div><p className="text-sm font-bold">No live battle right now</p><p className="mt-0.5 text-xs text-muted-foreground">Check upcoming matchups or challenge another crew.</p></div></div>}
    <div className="relative mt-4 flex items-center justify-between border-t border-border/80 pt-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground"><span>{battle?.is_weekly?"Weekly showdown":"Crew challenge"}</span><span className="inline-flex items-center gap-1 text-primary transition group-hover:gap-2">Open battle <ArrowUpRight className="h-3.5 w-3.5"/></span></div>
  </div>;
}
