import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, UserCheck, Users } from "lucide-react";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AvatarChip } from "@/components/avatar-chip";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "Find lifters — REPUNIT" }, { name: "description", content: "Discover lifters and grow your REPUNIT community." }] }),
  component: PeoplePage,
});

type Person = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null };

function PeoplePage() {
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["people-discovery", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: people, error: peopleError }, { data: follows, error: followsError }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, bio, avatar_url").order("created_at", { ascending: false }).limit(100),
        supabase.from("follows").select("following_id").eq("follower_id", user!.id),
      ]);
      if (peopleError) throw peopleError;
      if (followsError) throw followsError;
      return { people: (people ?? []) as Person[], following: new Set((follows ?? []).map((f) => f.following_id)) };
    },
  });

  const requestsQuery = useQuery({
    queryKey: ["friend-requests-inbox", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: requests, error } = await (supabase as any).from("friend_requests")
        .select("id,requester_id,created_at").eq("recipient_id", user!.id).eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }
      if (!requests?.length) return [];
      const { data: senders, error: sendersError } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url").in("id", requests.map((request: any) => request.requester_id));
      if (sendersError) throw sendersError;
      const byId = new Map((senders ?? []).map((sender) => [sender.id, sender]));
      return requests.map((request: any) => ({ ...request, sender: byId.get(request.requester_id) ?? null }));
    },
  });

  const filtered = (data?.people ?? []).filter((person) =>
    person.id !== user?.id &&
    [person.username, person.display_name ?? ""].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function respondToRequest(requestId: string, accept: boolean) {
    if (!user || requestBusyId) return;
    setRequestBusyId(requestId);
    const { error } = await (supabase as any).rpc("respond_friend_request", { _request: requestId, _accept: accept });
    if (error) toast.error("Could not update this friend request. Please try again.");
    else toast.success(accept ? "Friend request accepted." : "Friend request ignored.");
    await requestsQuery.refetch();
    setRequestBusyId(null);
  }

  async function toggleFollow(person: Person) {
    if (!user || !data || busyId) return;
    setBusyId(person.id);
    const isFollowing = data.following.has(person.id);
    const result = isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", person.id)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: person.id });
    if (result.error) toast.error("Could not update this follow. Check your connection and try again.");
    else {
      await qc.invalidateQueries({ queryKey: ["people-discovery", user.id] });
      await qc.invalidateQueries({ queryKey: ["profile-social"] });
      toast.success(isFollowing ? "Unfollowed" : "Following");
    }
    setBusyId(null);
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">REPUNIT COMMUNITY</p>
        <div className="mt-2 flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <h1 className="font-stat text-5xl uppercase sm:text-6xl">Find lifters<span className="text-primary">.</span></h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Find people, follow their progress and build your circle.</p>

        {requestsQuery.data && requestsQuery.data.length > 0 && <section className="mt-6 rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-wide">Friend requests</h2><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{requestsQuery.data.length} waiting</span></div>
          <div className="space-y-2">{requestsQuery.data.map((request: any) => <div key={request.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Link to="/u/$username" params={{ username: request.sender?.username ?? "" }} className="shrink-0"><AvatarChip name={request.sender?.username ?? "lifter"} url={request.sender?.avatar_url} className="h-10 w-10"/></Link>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{request.sender?.display_name || request.sender?.username || "A lifter"}</p><p className="text-xs text-muted-foreground">@{request.sender?.username ?? "lifter"}</p></div>
            <Button size="sm" variant="hero" disabled={requestBusyId !== null} onClick={() => void respondToRequest(request.id, true)}>Accept</Button>
            <Button size="sm" variant="line" disabled={requestBusyId !== null} onClick={() => void respondToRequest(request.id, false)}>Ignore</Button>
          </div>)}</div>
        </section>}
        {requestsQuery.isError && <p className="mt-4 text-xs text-muted-foreground">Friend requests could not be loaded. <button type="button" className="font-semibold text-primary underline" onClick={() => void requestsQuery.refetch()}>Retry</button></p>}

        <label className="mt-7 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-primary">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or name..." className="w-full bg-transparent text-sm outline-none" />
        </label>

        {isLoading && !data ? <p className="py-12 text-center text-sm text-muted-foreground">Loading lifters...</p>
          : isError && !data ? <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Lifters could not be loaded right now.</p><Button className="mt-3" size="sm" variant="line" onClick={() => void refetch()}>Retry</Button></div>
          : filtered.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No lifters found</p><p className="mt-1 text-sm text-muted-foreground">Try another username or come back when more people join.</p></div>
          : <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {filtered.map((person) => {
              const following = data!.following.has(person.id);
              return <div key={person.id} className="flex items-center gap-3 p-4">
                <Link to="/u/$username" params={{ username: person.username }} className="shrink-0"><AvatarChip name={person.username} url={person.avatar_url} className="h-12 w-12" /></Link>
                <div className="min-w-0 flex-1">
                  <Link to="/u/$username" params={{ username: person.username }} className="block truncate text-sm font-bold hover:text-primary">{person.display_name || person.username}</Link>
                  <p className="text-xs text-muted-foreground">@{person.username}</p>
                  {person.bio && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{person.bio}</p>}
                </div>
                <Button size="sm" variant={following ? "line" : "hero"} disabled={busyId !== null} onClick={() => void toggleFollow(person)}>
                  {following ? <><UserCheck className="mr-1.5 h-4 w-4" />Following</> : <><UserPlus className="mr-1.5 h-4 w-4" />Follow</>}
                </Button>
              </div>;
            })}
          </div>}
      </div>
    </PageShell>
  );
}
