import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadIdentity, markPublished, getPublishedFingerprint, type Identity } from "@/lib/identity";
import { publishPublicKey } from "@/lib/signaling.functions";

export function useIdentity(userId: string | null | "loading", isGuest: boolean) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const publishFn = useServerFn(publishPublicKey);

  useEffect(() => {
    if (userId === "loading") return;
    const id = userId ?? "guest";
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadIdentity(id, isGuest);
        if (cancelled) return;
        setIdentity(loaded);

        // Only authenticated users publish their public keys to Supabase.
        // Guests keep their keys local-only.
        if (!isGuest && userId) {
          const published = await getPublishedFingerprint();
          if (published !== loaded.fingerprint) {
            await publishFn({ data: { publicKey: loaded.publicKey as Record<string, any> } });
            await markPublished(loaded.fingerprint);
          }
        }
      } catch {
        // Identity errors are non-fatal; the app still works in local mode.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, isGuest, publishFn]);

  return identity;
}
