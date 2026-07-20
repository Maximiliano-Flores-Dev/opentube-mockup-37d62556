/**
 * WebRTC swarm registry.
 *
 * Authenticated users announce which videos they currently have cached in
 * their encrypted local vault so other peers can request the payload over a
 * data channel. The server only holds pointers (user + video + heartbeat).
 * No bytes of the video traverse this table.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AnnounceInput = z.object({ videoId: z.string().uuid() });

export const announceSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnnounceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_seeders").upsert(
      {
        video_id: data.videoId,
        user_id: context.userId,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "video_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const withdrawSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnnounceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("video_seeders")
      .delete()
      .eq("video_id", data.videoId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListInput = z.object({ videoId: z.string().uuid() });

export const listSeeders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("video_seeders")
      .select("user_id, last_seen")
      .eq("video_id", data.videoId)
      .gt("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const peers = (rows ?? [])
      .map((r) => ({ userId: r.user_id as string, lastSeen: r.last_seen as string }))
      .filter((p) => p.userId !== context.userId);
    return { peers, self: context.userId };
  });

const CountInput = z.object({ videoId: z.string().uuid() });

export const seederCount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CountInput.parse(d))
  .handler(async ({ data }) => {
    // Public count — no auth required. Uses the SECURITY DEFINER RPC.
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: count, error } = await sb.rpc("get_active_seeder_count", {
      _video_id: data.videoId,
    });
    if (error) throw new Error(error.message);
    return { count: Number(count ?? 0) };
  });
