import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Heart, MessageCircle, Send, Users, Dumbbell, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ThroneBanner } from "@/components/throne-banner";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Feed — REPUNIT" }, { name: "description", content: "The latest lifts and updates from your REPUNIT crew." }] }),
  component: FeedPage,
});

type FeedPost = {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  author: { username: string; display_name: string | null; avatar_url: string | null };
  likes: string[];
  comments: { id: string; user_id: string; content: string; created_at: string; author: { username: string; display_name: string | null } }[];
};

function FeedPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<string[]>([]);
  const feedKey = ["social-feed", user.id];

  const feed = useQuery({
    queryKey: feedKey,
    staleTime: 30000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<FeedPost[]> => {
      const { data: follows, error: followError } = await (supabase as any).from("follows").select("following_id").eq("follower_id", user.id);
      if (followError) throw followError;
      const authorIds = [...new Set([user.id, ...(follows ?? []).map((row: any) => row.following_id)])];
      const { data: posts, error: postError } = await (supabase as any).from("posts")
        .select("id,user_id,content,created_at").in("user_id", authorIds).order("created_at", { ascending: false }).limit(50);
      if (postError) throw postError;
      if (!posts?.length) return [];
      const postIds = posts.map((post: any) => post.id);
      const ids = [...new Set(posts.map((post: any) => post.user_id))];
      const [{ data: profiles, error: profilesError }, { data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
        (supabase as any).from("profiles").select("id,username,display_name,avatar_url").in("id", ids),
        (supabase as any).from("likes").select("post_id,user_id").in("post_id", postIds),
        (supabase as any).from("comments").select("id,post_id,user_id,content,created_at").in("post_id", postIds).order("created_at", { ascending: true }),
      ]);
      if (profilesError) throw profilesError;
      if (likesError) throw likesError;
      if (commentsError) throw commentsError;
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const commentIds = [...new Set((comments ?? []).map((comment: any) => comment.user_id))];
      const { data: commentProfiles, error: commentProfilesError } = commentIds.length
        ? await (supabase as any).from("profiles").select("id,username,display_name").in("id", commentIds)
        : { data: [], error: null };
      if (commentProfilesError) throw commentProfilesError;
      const commentProfileMap = new Map((commentProfiles ?? []).map((p: any) => [p.id, p]));
      return posts.map((post: any) => ({
        ...post,
        author: profileMap.get(post.user_id) ?? { username: "lifter", display_name: null, avatar_url: null },
        likes: (likes ?? []).filter((like: any) => like.post_id === post.id).map((like: any) => like.user_id),
        comments: (comments ?? []).filter((comment: any) => comment.post_id === post.id).map((comment: any) => ({
          ...comment,
          author: commentProfileMap.get(comment.user_id) ?? { username: "lifter", display_name: null },
        })),
      }));
    },
  });

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 2000) return;
    const { error } = await (supabase as any).from("posts").insert({ user_id: user.id, content });
    if (error) { toast.error("Could not publish your update. Check your connection and try again."); return; }
    setDraft("");
    await qc.invalidateQueries({ queryKey: feedKey });
    toast.success("Posted to your feed");
  }

  async function toggleLike(post: FeedPost) {
    const liked = post.likes.includes(user.id);
    const result = liked
      ? await (supabase as any).from("likes").delete().eq("post_id", post.id).eq("user_id", user.id)
      : await (supabase as any).from("likes").insert({ post_id: post.id, user_id: user.id });
    if (result.error) { toast.error("Could not update this like. Try again."); return; }
    await qc.invalidateQueries({ queryKey: feedKey });
  }

  async function addComment(postId: string) {
    const content = (commentDrafts[postId] ?? "").trim();
    if (!content || content.length > 2000) return;
    const { error } = await (supabase as any).from("comments").insert({ post_id: postId, user_id: user.id, content });
    if (error) { toast.error("Could not add your comment. Try again."); return; }
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    await qc.invalidateQueries({ queryKey: feedKey });
    toast.success("Comment added");
  }

  function toggleComments(postId: string) {
    setOpenComments((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]);
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow text-primary">YOUR PEOPLE. YOUR PROGRESS.</p><h1 className="font-stat mt-2 text-6xl uppercase">Feed<span className="text-primary">.</span></h1><p className="mt-2 text-sm text-muted-foreground">The work never happens alone. See what your people are lifting.</p></div>
        <Button variant="line" onClick={() => void feed.refetch()} disabled={feed.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${feed.isFetching ? "animate-spin" : ""}`}/>Refresh</Button>
      </div>

      <div className="mt-6"><ThroneBanner/></div>
      <form onSubmit={publish} className="mt-7 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/15 text-primary">YOU</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Share a win, a goal, or today's session…" className="min-h-20 resize-y border-0 bg-background/70 focus-visible:ring-1"/>
            <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{draft.length}/2000</span><Button type="submit" variant="hero" size="sm" disabled={!draft.trim()}><Send className="mr-2 h-3.5 w-3.5"/>Post update</Button></div>
          </div>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {feed.isLoading && !feed.data ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-border bg-card/70"/>)
        : feed.isError && !feed.data?.length ? <div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="font-bold">Your feed could not load.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p><Button className="mt-4" variant="line" onClick={() => void feed.refetch()}>Try again</Button></div>
        : feed.data?.length ? <>{feed.isError && <p className="text-xs text-muted-foreground">Showing the last available feed. <button type="button" onClick={() => void feed.refetch()} className="font-bold text-primary underline">Retry</button></p>}{feed.data.map((post) => {
          const liked = post.likes.includes(user.id);
          const commentsVisible = openComments.includes(post.id);
          return <article key={post.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10"><AvatarImage src={post.author.avatar_url ?? undefined}/><AvatarFallback className="bg-elevated">{post.author.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><Link to="/u/$username" params={{ username: post.author.username }} className="truncate text-sm font-bold hover:text-primary">{post.author.display_name || post.author.username}</Link><p className="text-xs text-muted-foreground">@{post.author.username} · {new Date(post.created_at).toLocaleString()}</p></div>
              {post.user_id === user.id && <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">You</span>}
            </div>
            {post.content && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.content}</p>}
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              <Button type="button" size="sm" variant={liked ? "outline" : "ghost"} onClick={() => void toggleLike(post)}><Heart className={`mr-1.5 h-4 w-4 ${liked ? "fill-current text-primary" : ""}`}/>{post.likes.length} {post.likes.length === 1 ? "Like" : "Likes"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => toggleComments(post.id)}><MessageCircle className="mr-1.5 h-4 w-4"/>{post.comments.length} Comments</Button>
            </div>
            {commentsVisible && <div className="mt-3 space-y-3 border-t border-border pt-3">
              {post.comments.map((comment) => <div key={comment.id} className="flex gap-2 text-xs"><span className="font-bold">{comment.author.display_name || comment.author.username}</span><span className="min-w-0 break-words text-muted-foreground">{comment.content}</span></div>)}
              <div className="flex gap-2"><Textarea value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={2000} rows={1} placeholder="Write a comment…" className="min-h-10 flex-1"/><Button type="button" size="icon" variant="hero" aria-label="Send comment" disabled={!(commentDrafts[post.id] ?? "").trim()} onClick={() => void addComment(post.id)}><Send className="h-4 w-4"/></Button></div>
            </div>}
          </article>;
        })}</> : <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center"><Users className="mx-auto h-8 w-8 text-primary"/><h2 className="mt-3 font-bold">Your feed starts with your people</h2><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Follow lifters to see their updates, or share your first post with the REPUNIT community.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button asChild variant="hero"><Link to="/people">Find lifters</Link></Button><Button asChild variant="line"><Link to="/dashboard"><Dumbbell className="mr-2 h-4 w-4"/>Go to training hub</Link></Button></div></div>}
      </div>
    </PageShell>
  );
}
