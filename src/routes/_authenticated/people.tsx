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
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
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

  const filtered = (data?.people ?? []).filter((person) =>
    person.id !== user?.id &&
    [person.username, person.display_name ?? ""].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function toggleFollow(person: Person) {
    if (!user || !data || busyId) return;
    setBusyId(person.id);
    const isFollowing = data.following.has(person.id);
    const result = isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", person.id)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: person.id });
    if (result.error) toast.error(result.error.message);
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

        <label className="mt-7 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-primary">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or name..." className="w-full bg-transparent text-sm outline-none" />
        </label>

        {isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading lifters...</p>
          : isError ? <p className="py-12 text-center text-sm text-destructive">Could not load people. Check your connection and try again.</p>
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
