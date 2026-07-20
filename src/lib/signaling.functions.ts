/**
 * Supabase-backed signaling server functions for WebRTC.
 *
 * These endpoints are intentionally minimal: they only carry opaque SDP and
 * ICE candidates between authenticated peers. The actual media negotiation
 * happens peer-to-peer in the browser via WebRTC; the server never sees the
 * keys or the payload.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "ready" };

const PublishKeyInput = z.object({
  publicKey: z.record(z.any()),
});

export const publishPublicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crypto_identities").upsert(
      {
        user_id: context.userId,
        public_key: data.publicKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const GetKeyInput = z.object({ userId: z.string().uuid() });

export const getPublicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("crypto_identities")
      .select("public_key")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { publicKey: (row?.public_key as Record<string, any>) ?? null };
  });

const SendSignalInput = z.object({
  receiverId: z.string().uuid(),
  roomId: z.string().min(1).max(200),
  payload: z.record(z.any()),
});

export const sendSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendSignalInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("signaling").insert({
      sender_id: context.userId,
      receiver_id: data.receiverId,
      room_id: data.roomId,
      payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PollInput = z.object({ roomId: z.string().min(1).max(200) });

export const pollSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PollInput.parse(d))
  .handler(async ({ data, context }) => {
    // Clean up expired signals before reading.
    await context.supabase.rpc("delete_expired_signals");
    const { data: rows, error } = await context.supabase
      .from("signaling")
      .select("id, sender_id, payload, created_at")
      .eq("receiver_id", context.userId)
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      signals: (rows ?? []).map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        payload: r.payload as SignalPayload,
        createdAt: r.created_at,
      })),
    };
  });

const DeleteSignalInput = z.object({ signalId: z.string().uuid() });

export const deleteSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteSignalInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("signaling").delete().eq("id", data.signalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
