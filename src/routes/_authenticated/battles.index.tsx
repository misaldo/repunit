import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/app-shell";
import { CrewBattles } from "@/components/crew-battles";
import { supabase } from "@/integrations/supabase/client";
import { Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/_authenticated/battles/")({head:()=>({meta:[{title:"Battles — REPUNIT"},{name:"description",content:"Weekly crew battles and rival challenges."}]}),component:Battles});
function Battles(){
 const {user}=Route.useRouteContext();
 const {data:crews=[],isLoading,isError,refetch}=useQuery({queryKey:["battle-crews",user.id],queryFn:async()=>{
  const {data:members,error}=await (supabase as any).from("crew_members").select("crew_id,role").eq("user_id",user.id);
  if(error)throw error;
  const ids=[...new Set((members??[]).map((m:any)=>m.crew_id))];
  if(!ids.length)return [];
  const {data:rows,error:crewError}=await (supabase as any).from("crews").select("id,name").in("id",ids);
  if(crewError)throw crewError;
  const byId=new Map((rows??[]).map((crew:any)=>[crew.id,crew]));
  return (members??[]).map((m:any)=>({...m,crews:byId.get(m.crew_id)??null}));
 }});
 return <PageShell><div className="battle-hero relative isolate overflow-hidden rounded-3xl border border-primary/25 bg-card px-5 py-8 md:px-9 md:py-10"><div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl"/><div className="relative"><p className="eyebrow text-primary">REPUNIT COMPETITION / SEASON 01</p><h1 className="font-stat mt-3 text-6xl uppercase tracking-tight md:text-8xl">Battles<span className="text-primary">.</span></h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Weekly crew matchups. Verified lifts only. Every kilo counts. Build your rivalry and own the scoreboard.</p></div><div className="relative mt-7 flex flex-wrap gap-3"><Button asChild variant="hero"><Link to="/crews"><Swords className="mr-2 h-4 w-4"/>Find a crew</Link></Button><Button asChild variant="line"><Link to="/leaderboards"><Trophy className="mr-2 h-4 w-4"/>View TOP</Link></Button></div></div>

 {isLoading?<p className="mt-8 text-sm text-muted-foreground">Loading your crews…</p>:isError?<div className="mt-8"><p>Could not load your crews.</p><Button className="mt-3" variant="line" onClick={()=>refetch()}>Try again</Button></div>:crews.length===0?<div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center"><Swords className="mx-auto h-8 w-8 text-primary"/><h2 className="mt-3 font-bold">Join the competition</h2><p className="mt-1 text-sm text-muted-foreground">Join or create a crew to enter weekly battles.</p><Button asChild variant="hero" className="mt-4"><Link to="/crews">Explore crews</Link></Button></div>:<div className="mt-8 space-y-10">{crews.map((m:any)=>m.crews&&<section key={m.crew_id} className="battle-enter"><div className="mb-3 flex items-center justify-between"><Link to="/crews/$id" params={{id:m.crew_id}} className="font-stat text-2xl uppercase transition hover:text-primary">{m.crews.name}</Link><Link to="/crews/$id" params={{id:m.crew_id}} className="text-xs font-bold text-primary hover:underline">Crew page →</Link></div><CrewBattles crewId={m.crew_id} userId={user.id} isAdmin={m.role==="admin"}/></section>)}</div>}
 </PageShell>;
}
