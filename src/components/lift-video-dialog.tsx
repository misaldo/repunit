import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-session";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exerciseLabel } from "@/lib/lifts";

export function LiftVideoDialog({ liftId, open, onOpenChange }: { liftId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const queryKey = ["lift-video-dialog", liftId];

  const query = useQuery({
    queryKey,
    enabled: open && !!liftId,
    queryFn: async () => {
      const { data: lift, error: liftError } = await (supabase as any).from("lifts")
        .select("id,user_id,exercise,weight_kg,reps,lifted_on,description,video_path")
        .eq("id", liftId).single();
      if (liftError) throw liftError;
      const [{ data: profile, error: profileError }, { data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
        (supabase as any).from("profiles").select("username,display_name,avatar_url").eq("id", lift.user_id).single(),
        (supabase as any).from("lift_likes").select("user_id").eq("lift_id", liftId),
        (supabase as any).from("lift_comments").select("id,user_id,content,created_at").eq("lift_id", liftId).order("created_at", { ascending: true }),
      ]);
      if (profileError) throw profileError;
      // Likes and comments are optional social features. Their tables may not
      // exist in every deployed database yet, so they must never block video playback.
      const likesAvailable = !likesError;
      const commentsAvailable = !commentsError;
      const safeLikes = likesAvailable ? (likes ?? []) : [];
      const safeComments = commentsAvailable ? (comments ?? []) : [];
      const commentUserIds = [...new Set(safeComments.map((comment: any) => comment.user_id))];
      const { data: commentProfiles, error: commentProfilesError } = commentUserIds.length
        ? await (supabase as any).from("profiles").select("id,username,display_name,avatar_url").in("id", commentUserIds)
        : { data: [], error: null };
      if (commentProfilesError && commentsAvailable) throw commentProfilesError;
      const profileMap = new Map<string, any>();
      for (const row of commentProfiles ?? []) profileMap.set(row.id, row);
      let videoUrl: string | null = null;
      if (lift.video_path) {
        const { data: signed, error: signedError } = await supabase.storage.from("lift-videos").createSignedUrl(lift.video_path, 3600);
        if (!signedError) videoUrl = signed?.signedUrl ?? null;
      }
      return {
        lift, profile, videoUrl,
        likes: safeLikes.map((like: any) => like.user_id),
        likesAvailable,
        commentsAvailable,
        comments: safeComments.map((comment: any) => ({ ...comment, author: profileMap.get(comment.user_id) ?? { username: "lifter", display_name: null, avatar_url: null } })),
      };
    },
  });

  async function toggleLike() {
    if (!user || !query.data || !liftId) { toast.error("Sign in to like lift videos."); return; }
    const liked = query.data.likes.includes(user.id);
    const result = liked
      ? await (supabase as any).from("lift_likes").delete().eq("lift_id", liftId).eq("user_id", user.id)
      : await (supabase as any).from("lift_likes").insert({ lift_id: liftId, user_id: user.id });
    if (result.error) { toast.error("Could not update your like. Please try again."); return; }
    await qc.invalidateQueries({ queryKey });
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!user || !liftId || !content || content.length > 2000) return;
    const { error } = await (supabase as any).from("lift_comments").insert({ lift_id: liftId, user_id: user.id, content });
    if (error) { toast.error("Could not add your comment. Please try again."); return; }
    setDraft("");
    await qc.invalidateQueries({ queryKey });
    toast.success("Comment added");
  }

  const data = query.data;
  const liked = Boolean(user && data?.likes.includes(user.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto border-border bg-card p-4 sm:p-6">
        {query.isLoading ? <div className="space-y-4"><div className="h-7 w-48 animate-pulse rounded bg-elevated"/><div className="aspect-video animate-pulse rounded-xl bg-elevated"/><div className="h-20 animate-pulse rounded-xl bg-elevated"/></div>
        : (query.isError && !data) || !data ? <div className="py-8 text-center"><Video className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm font-semibold">Lift video unavailable</p><p className="mt-1 text-xs text-muted-foreground">The video may have been removed or is temporarily unavailable.</p><Button className="mt-4" variant="line" onClick={() => void query.refetch()}>Try again</Button></div>
        : <>
          <DialogHeader>
            <DialogTitle className="font-stat text-3xl uppercase">{exerciseLabel(data.lift.exercise)} · {Number(data.lift.weight_kg)} kg</DialogTitle>
            <DialogDescription>{data.lift.reps} reps · {data.lift.lifted_on}</DialogDescription>
          </DialogHeader>
          {data.videoUrl ? <video src={data.videoUrl} controls playsInline preload="metadata" className="mt-2 max-h-[52vh] w-full rounded-xl border border-border bg-black"/> : <div className="mt-2 flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground">Video evidence is not available right now.</div>}
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10"><AvatarImage src={data.profile.avatar_url ?? undefined}/><AvatarFallback>{data.profile.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><Link to="/u/$username" params={{username:data.profile.username}} className="text-sm font-bold hover:text-primary">{data.profile.display_name || data.profile.username}</Link><p className="text-xs text-muted-foreground">@{data.profile.username}</p></div>
            {data.likesAvailable && <Button size="sm" variant={liked ? "outline" : "ghost"} onClick={() => void toggleLike()}><Heart className={`mr-1.5 h-4 w-4 ${liked ? "fill-current text-primary" : ""}`}/>{data.likes.length}</Button>}
          </div>
          {data.lift.description && <p className="text-sm text-muted-foreground">{data.lift.description}</p>}
          {data.commentsAvailable && <section className="border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4 text-primary"/> Comments <span className="text-muted-foreground">({data.comments.length})</span></h3>
            <div className="mt-3 max-h-40 space-y-3 overflow-y-auto">
              {data.comments.length ? data.comments.map((comment: any) => <div key={comment.id} className="flex items-start gap-2 text-xs"><Avatar className="h-7 w-7"><AvatarImage src={comment.author.avatar_url ?? undefined}/><AvatarFallback>{comment.author.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2"><p className="font-bold">{comment.author.display_name || comment.author.username}</p><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{comment.content}</p></div>) : <p className="text-xs text-muted-foreground">No comments yet. Start the conversation.</p>}
            </div>
            <form onSubmit={addComment} className="mt-3 flex items-end gap-2"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={1} placeholder={user ? "Add a comment…" : "Sign in to comment"} disabled={!user} className="min-h-10 flex-1"/><Button type="submit" size="icon" variant="hero" aria-label="Send comment" disabled={!user || !draft.trim()}><Send className="h-4 w-4"/></Button></form>
          </section>}
        </>}
      </DialogContent>
    </Dialog>
  );
}
