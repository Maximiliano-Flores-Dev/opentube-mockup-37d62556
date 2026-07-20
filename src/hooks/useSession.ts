import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useGuestIdentity, type GuestIdentity } from "./useGuestIdentity";
import { useIdentity } from "./useIdentity";
import { getMyProfile, type ProfileDTO } from "@/lib/profile.functions";

export type SessionState =
  | { mode: "loading"; userId: null; guest: GuestIdentity; profile: null }
  | { mode: "guest"; userId: null; guest: GuestIdentity; profile: null }
  | { mode: "user"; userId: string; guest: GuestIdentity; profile: ProfileDTO | null };

export function useSession(): SessionState {
  const guest = useGuestIdentity();
  const [userId, setUserId] = useState<string | null | "loading">("loading");
  const getProfileFn = useServerFn(getMyProfile);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const profileQ = useQuery({
    queryKey: ["my-profile", userId],
    queryFn: () => getProfileFn(),
    enabled: typeof userId === "string" && userId !== "loading",
    staleTime: 30_000,
  });

  // Load/generate the local cryptographic identity and publish the public key
  // for authenticated users. This is the foundation for E2EE and WebRTC P2P.
  useIdentity(userId, userId === null);

  if (userId === "loading") {
    return { mode: "loading", userId: null, guest, profile: null };
  }
  if (userId === null) {
    return { mode: "guest", userId: null, guest, profile: null };
  }
  return { mode: "user", userId, guest, profile: profileQ.data ?? null };
}
