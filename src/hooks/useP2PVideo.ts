/**
 * Orchestrates P2P behavior around a single video playback session:
 *  - caches the payload locally (encrypted) on first play
 *  - once cached, announces this browser as a seeder in the swarm
 *  - polls the swarm for a live peer count
 *
 * All heartbeats stop and the seed row is withdrawn when the component
 * unmounts or the video changes.
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCachedVideo, type CacheStatus } from "@/lib/video-cache";
import { announceSeed, seederCount, withdrawSeed } from "@/lib/seeders.functions";

const HEARTBEAT_MS = 60_000;
const PEER_POLL_MS = 15_000;

export type P2PVideoState = {
  cache: CacheStatus;
  playbackUrl: string;
  peers: number;
  seeding: boolean;
};

export function useP2PVideo(params: {
  videoId: string;
  originUrl: string;
  mimeType: string;
  authed: boolean;
  eligibleSource: boolean;
}): P2PVideoState {
  const { videoId, originUrl, mimeType, authed, eligibleSource } = params;

  const announce = useServerFn(announceSeed);
  const withdraw = useServerFn(withdrawSeed);
  const count = useServerFn(seederCount);

  const { status } = useCachedVideo(videoId, originUrl, mimeType, eligibleSource && authed);

  const [peers, setPeers] = useState(0);
  const [seeding, setSeeding] = useState(false);

  const cached = status.phase === "cached";

  // Seed heartbeat (only when we actually have the bytes locally + signed in).
  useEffect(() => {
    if (!cached || !authed || !videoId) return;
    let cancelled = false;
    const beat = async () => {
      try {
        await announce({ data: { videoId } });
        if (!cancelled) setSeeding(true);
      } catch {
        if (!cancelled) setSeeding(false);
      }
    };
    beat();
    const t = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      setSeeding(false);
      withdraw({ data: { videoId } }).catch(() => {});
    };
  }, [cached, authed, videoId, announce, withdraw]);

  // Peer count polling (works for anon and signed-in viewers).
  useEffect(() => {
    if (!videoId || !eligibleSource) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { count: n } = await count({ data: { videoId } });
        if (!cancelled) setPeers(n);
      } catch {
        if (!cancelled) setPeers(0);
      }
    };
    tick();
    const t = window.setInterval(tick, PEER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [videoId, eligibleSource, count]);

  const playbackUrl = status.phase === "cached" ? status.blobUrl : originUrl;

  return { cache: status, playbackUrl, peers, seeding };
}
