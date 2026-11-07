import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/app-shell";
import { CrewBattles } from "@/components/crew-battles";
import { supabase } from "@/integrations/supabase/client";
import { Swords, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/_authenticated/battles/$id")({head:()=>({meta:[{title:"Battle details — REPUNIT"},{name:"description",content:"Crew battle details and live score."}]}),component:BattleDetail});
function BattleDetail(){
 const {id}=Route.useParams();const {user}=Route.useRouteContext();
 const {data,isLoading,isError,refetch}=useQuery({queryKey:["battle-detail",id,user.id],queryFn:async()=>{
  const {data:b,error}=await (supabase as any).from("crew_battles").select("id,challenger_crew_id,opponent_crew_id,category,starts_at,ends_at,status,is_weekly").eq("id",id).maybeSingle();
  if(error)throw error;if(!b)return null;
  const {data:membership,error:memberError}=await (supabase as any).from("crew_members").select("crew_id,role").eq("user_id",user.id).in("crew_id",[b.challenger_crew_id,b.opponent_crew_id]);
  if(memberError)throw memberError;
  if(!membership?.length)throw new Error("You need to join one of the crews to view this battle.");
  return {battle:b,membership};
 }});
 return <PageShell><div className="battle-enter"><Button asChild variant="ghost" size="sm"><Link to="/battles"><ArrowLeft className="mr-2 h-4 w-4"/>All battles</Link></Button>
 {isLoading&&!data?<p className="mt-6 text-muted-foreground">Loading battle…</p>:isError&&!data?<div className="mt-6"><p>Could not load this battle.</p><Button variant="line" className="mt-3" onClick={()=>refetch()}>Try again</Button></div>:!data?<p className="mt-6">Battle not found.</p>:<><div className="battle-enter relative mt-5 overflow-hidden rounded-2xl border border-primary/25 bg-card p-5 md:p-7"><div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"/><div className="relative"><p className="eyebrow text-primary">BATTLE DETAILS</p><h1 className="font-stat mt-2 flex items-center gap-3 text-5xl uppercase"><Swords className="h-8 w-8 text-primary"/>Showdown</h1><p className="mt-2 text-sm text-muted-foreground">{data.battle.is_weekly?"Weekly matchup":"Direct crew challenge"} · {data.battle.category.toUpperCase()}</p></div></div><CrewBattles crewId={data.membership[0].crew_id} userId={user.id} isAdmin={data.membership.some((m:any)=>m.role==="admin")} focusBattleId={id}/></>}
 </div></PageShell>;
}
