
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Send, Rss, LoaderCircle } from "lucide-react";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  username: string;
};

type FeedPost = {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  likes: string[];
  comments: FeedComment[];
};

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Community Feed — REPUNIT" },
      { name: "description", content: "See what your crew is lifting." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useMyProfile(user.id);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setError("");

    const { data: postRows, error: postError } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (postError) {
      setError(postError.message);
      setLoading(false);
      return;
    }

    if (!postRows || postRows.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = postRows.map((post) => post.id);
    const userIds = [...new Set(postRows.map((post) => post.user_id))];

    const [{ data: profiles }, { data: likes }, { data: comments }] =
      await Promise.all([
        supabase.from("profiles").select("*").in("id", userIds),
        supabase.from("likes").select("*").in("post_id", postIds),
        supabase
          .from("comments")
          .select("*")
          .in("post_id", postIds)
          .order("created_at", { ascending: true }),
      ]);

    const commentUserIds = [...new Set((comments ?? []).map((c) => c.user_id))];
    const allUserIds = [...new Set([...userIds, ...commentUserIds])];

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", allUserIds);

    const profileMap = new Map(
      (allProfiles ?? profiles ?? []).map((p) => [p.id, p])
    );

    const mappedPosts: FeedPost[] = postRows.map((post) => {
      const author = profileMap.get(post.user_id);

      return {
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        created_at: post.created_at,
        username: author?.username ?? "unknown",
        display_name: author?.display_name ?? null,
        avatar_url: author?.avatar_url ?? null,
        likes: (likes ?? [])
          .filter((like) => like.post_id === post.id)
          .map((like) => like.user_id),
        comments: (comments ?? [])
          .filter((comment) => comment.post_id === post.id)
          .map((comment) => ({
            ...comment,
            username: profileMap.get(comment.user_id)?.username ?? "unknown",
          })),
      };
    });

    setPosts(mappedPosts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  async function createPost() {
    const text = content.trim();
    if (!text || posting) return;

    setPosting(true);
    setError("");

    const { error: insertError } = await supabase.from("posts").insert({
      user_id: user.id,
      content: text,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setContent("");
      await loadFeed();
    }

    setPosting(false);
  }

  async function toggleLike(post: FeedPost) {
    const liked = post.likes.includes(user.id);

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              likes: liked
                ? item.likes.filter((id) => id !== user.id)
                : [...item.likes, user.id],
            }
          : item
      )
    );

    const result = liked
      ? await supabase
          .from("likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
      : await supabase.from("likes").insert({
          post_id: post.id,
          user_id: user.id,
        });

    if (result.error) {
      setError(result.error.message);
      await loadFeed();
    }
  }

  async function addComment(postId: string) {
    const text = (commentInputs[postId] ?? "").trim();
    if (!text || sendingComment) return;

    setSendingComment(postId);
    setError("");

    const { error: commentError } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      content: text,
    });

    if (commentError) {
      setError(commentError.message);
    } else {
      setCommentInputs((current) => ({ ...current, [postId]: "" }));
      await loadFeed();
    }

    setSendingComment(null);
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="eyebrow">REPUNIT COMMUNITY</p>
          <div className="mt-2 flex items-center justify-between">
            <h1 className="font-stat text-5xl uppercase sm:text-6xl">
              The Feed<span className="text-primary">.</span>
            </h1>
            <Rss className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your training. Your crew. Your progress.
          </p>
        </div>

        <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
              {profile?.username?.charAt(0).toUpperCase() ?? "R"}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {profile?.display_name || profile?.username || "Your profile"}
              </p>
              <p className="text-xs text-muted-foreground">
                Share your latest progress
              </p>
            </div>
          </div>

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What did you achieve today?"
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none transition focus:border-primary"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {content.length}/2000
            </span>
            <Button
              variant="hero"
              onClick={createPost}
              disabled={!content.trim() || posting}
            >
              {posting ? "Posting..." : "Share post"}
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Latest activity
          </h2>
          <button
            onClick={() => {
              setLoading(true);
              void loadFeed();
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-14 text-center">
            <Rss className="mx-auto mb-4 h-9 w-9 text-muted-foreground" />
            <h3 className="font-semibold">Your feed starts here.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Be the first to share a training update with the community.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const liked = post.likes.includes(user.id);

              return (
                <article
                  key={post.id}
                  className="rounded-2xl border border-border bg-card p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-sm font-bold">
                      {post.avatar_url ? (
                        <img
                          src={post.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        post.username.charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        to="/u/$username"
                        params={{ username: post.username }}
                        className="text-sm font-bold hover:text-primary"
                      >
                        {post.display_name || `@${post.username}`}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        @{post.username} ·{" "}
                        {new Date(post.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {post.content && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
                      {post.content}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-5 border-t border-border pt-3">
                    <button
                      onClick={() => void toggleLike(post)}
                      className={`flex items-center gap-2 text-sm transition ${
                        liked
                          ? "text-primary"
                          : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <Heart
                        className="h-5 w-5"
                        fill={liked ? "currentColor" : "none"}
                      />
                      {post.likes.length}
                    </button>

                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MessageCircle className="h-5 w-5" />
                      {post.comments.length}
                    </span>
                  </div>

                  {post.comments.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      {post.comments.map((comment) => (
                        <div key={comment.id} className="text-sm">
                          <Link
                            to="/u/$username"
                            params={{ username: comment.username }}
                            className="mr-2 font-bold hover:text-primary"
                          >
                            @{comment.username}
                          </Link>
                          <span className="text-muted-foreground">
                            {comment.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addComment(post.id);
                    }}
                  >
                    <input
                      value={commentInputs[post.id] ?? ""}
                      onChange={(event) =>
                        setCommentInputs((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      placeholder="Write a comment..."
                      maxLength={1000}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="line"
                      disabled={
                        !(commentInputs[post.id] ?? "").trim() ||
                        sendingComment === post.id
                      }
                      aria-label="Send comment"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
