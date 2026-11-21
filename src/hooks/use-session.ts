import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let previousUserId: string | null | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      if (previousUserId !== undefined && previousUserId !== nextUserId) {
        // Purge account-scoped cached data before rendering the next identity.
        void queryClient.cancelQueries();
        queryClient.clear();
        queueMicrotask(() => {
          if (active) void router.invalidate();
        });
      }
      previousUserId = nextUserId;
      setUser(nextUser);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient, router]);
  return { user, ready };
}

export function useMyProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error("Sign in to load your profile.");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
  });
}
