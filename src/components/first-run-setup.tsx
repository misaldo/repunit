import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Users, UserPlus, ArrowRight, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useUser } from "@/hooks/use-session";
import { USERNAME_RE } from "@/lib/lifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function FirstRunSetup() {
  const { user } = useUser();
  const { data: profile } = useMyProfile(user?.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<"profile" | "community">("profile");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [locallyCompleted, setLocallyCompleted] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("repunit-onboarding-done:" + (user?.id ?? "")) === "1");

  useEffect(() => {
    if (!user?.id) return;
    try { setLocallyCompleted(window.localStorage.getItem("repunit-onboarding-done:" + user.id) === "1"); } catch { setLocallyCompleted(false); }
  }, [user?.id]);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? "");
    setNickname(profile.display_name ?? "");
  }, [profile?.id, profile?.username, profile?.display_name]);

  const open = Boolean(user?.id && profile && (profile as any).onboarding_completed !== true && !locallyCompleted);
  if (!open || !profile || !user) return null;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    const cleanNickname = nickname.trim().slice(0, 40);
    if (!USERNAME_RE.test(cleanUsername)) {
      toast.error("Username must be 3–20 lowercase letters, numbers or underscores.");
      return;
    }
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      let avatarUploadFailed = false;
      if (avatar) {
        if (!avatar.type.startsWith("image/") || avatar.size > 5 * 1024 * 1024) {
          throw new Error("Choose an image under 5 MB.");
        }
        const extension = avatar.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = user.id + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, {
          cacheControl: "3600", upsert: true, contentType: avatar.type,
        });
        if (uploadError) avatarUploadFailed = true;
        else avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const update: Record<string, unknown> = {
        username: cleanUsername,
        display_name: cleanNickname || null,
      };
      if (avatarUrl) update.avatar_url = avatarUrl;
      const { data: updated, error } = await (supabase as any).from("profiles")
        .update(update).eq("id", user.id).select("*").single();
      if (error) {
        if (error.code === "23505") throw new Error("That username is already taken. Choose another one.");
        throw error;
      }
      queryClient.setQueryData(["profile", user.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["public-profile"] });
      if (avatarUploadFailed) toast.error("Profile saved. Your picture needs the avatar storage setup before it can upload.");
      setStep("community");
    } catch (error) {
      toast.error(error instanceof Error && error.message.includes("already taken")
        ? error.message
        : error instanceof Error && error.message.includes("under 5 MB")
          ? error.message
          : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function finish(destination: "/leaderboards" | "/crews/new" | "/people") {
    setSaving(true);
    const { error } = await (supabase as any).from("profiles")
      .update({ onboarding_completed: true }).eq("id", user.id);
    // Keep onboarding from blocking the app if the new migration has not yet
    // reached a preview database; local completion is a safe fallback.
    if (error) {
      try { window.localStorage.setItem("repunit-onboarding-done:" + user.id, "1"); } catch { /* storage may be disabled */ }
      setLocallyCompleted(true);
    } else {
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
    }
    setSaving(false);
    void navigate({ to: destination });
  }

  return (
    <Dialog open>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto border-border bg-card">
        {step === "profile" ? (
          <>
            <DialogHeader>
              <p className="eyebrow text-primary">WELCOME TO REPUNIT</p>
              <DialogTitle className="font-stat text-3xl uppercase">Make it yours<span className="text-primary">.</span></DialogTitle>
              <p className="text-sm text-muted-foreground">Set up your profile so your crew and friends know it’s you.</p>
            </DialogHeader>
            <form onSubmit={saveProfile} className="space-y-4 pt-2">
              <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border bg-background p-4 transition hover:border-primary/50">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                  {avatar ? <img src={URL.createObjectURL(avatar)} alt="Selected profile" className="h-full w-full object-cover"/> : profile.avatar_url ? <img src={profile.avatar_url} alt="Current profile" className="h-full w-full object-cover"/> : <Camera className="h-6 w-6"/>}
                </span>
                <span className="min-w-0 flex-1"><b className="block text-sm">Add a profile picture</b><span className="text-xs text-muted-foreground">Choose an image · max 5 MB</span></span>
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}/>
              </label>
              <div className="space-y-1.5"><label htmlFor="repunit-onboarding-nickname" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nickname</label><Input id="repunit-onboarding-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} placeholder="How should people call you?"/></div>
              <div className="space-y-1.5"><label htmlFor="repunit-onboarding-username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label><Input id="repunit-onboarding-username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} placeholder="your_username"/><p className="text-xs text-muted-foreground">Your unique REPUNIT handle.</p></div>
              <Button type="submit" variant="hero" className="w-full" disabled={saving}>{saving ? "Saving…" : "Continue"}<ArrowRight className="ml-2 h-4 w-4"/></Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <p className="eyebrow text-primary">YOUR PEOPLE. YOUR PROGRESS.</p>
              <DialogTitle className="font-stat text-3xl uppercase">Build your circle<span className="text-primary">.</span></DialogTitle>
              <p className="text-sm text-muted-foreground">REPUNIT is better with people. Start a crew or find lifters to follow.</p>
            </DialogHeader>
            <div className="grid gap-3 pt-2">
              <button type="button" onClick={() => void finish("/crews/new")} disabled={saving} className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/60 hover:bg-primary/5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-6 w-6"/></span>
                <span className="min-w-0 flex-1"><b className="block">Create your CREW</b><span className="text-xs text-muted-foreground">Bring your friends together and compete.</span></span><ArrowRight className="h-5 w-5"/>
              </button>
              <button type="button" onClick={() => void finish("/people")} disabled={saving} className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/60 hover:bg-primary/5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserPlus className="h-6 w-6"/></span>
                <span className="min-w-0 flex-1"><b className="block">Find friends</b><span className="text-xs text-muted-foreground">Discover lifters and follow their progress.</span></span><ArrowRight className="h-5 w-5"/>
              </button>
              <Button type="button" variant="line" className="w-full" disabled={saving} onClick={() => void finish("/leaderboards")}><Dumbbell className="mr-2 h-4 w-4"/>Explore TOP first</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
