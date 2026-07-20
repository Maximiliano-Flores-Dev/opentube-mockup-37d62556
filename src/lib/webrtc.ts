/**
 * OpenTube WebRTC peer manager.
 *
 * Builds a direct peer-to-peer connection between two authenticated users.
 * Signaling (SDP offers/answers and ICE candidates) travels through the
 * Supabase `signaling` table; the actual media/data channel is peer-to-peer.
 *
 * This implementation currently establishes a real WebRTC data channel. The
 * same connection can be upgraded later to carry `MediaStream` tracks for live
 * or recorded video streaming.
 */

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  pollSignals,
  sendSignal,
  deleteSignal,
  type SignalPayload,
} from "./signaling.functions";
import { importPrivateKeys, type Identity } from "./identity";
import { aesDecrypt, aesEncrypt, deriveSharedKey, importEcdhPublicKey } from "./crypto";

export type PeerStatus =
  | "idle"
  | "connecting"
  | "signaling"
  | "connected"
  | "disconnected"
  | "failed";

export type PeerMessage = {
  senderId: string;
  text: string;
  encrypted: boolean;
  timestamp: number;
};

export type PeerConnection = {
  status: PeerStatus;
  messages: PeerMessage[];
  connect: () => void;
  send: (text: string) => Promise<void>;
  close: () => void;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SIGNAL_POLL_MS = 1500;

export function usePeerConnection(
  roomId: string | null,
  remoteUserId: string | null,
  polite: boolean,
  identity: Identity | null,
  remotePublicKey: Record<string, unknown> | null,
): PeerConnection {
  const pollFn = useServerFn(pollSignals);
  const sendFn = useServerFn(sendSignal);
  const deleteFn = useServerFn(deleteSignal);

  const [status, setStatus] = useState<PeerStatus>("idle");
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const processedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!roomId || !remoteUserId || !identity) return;
    const peerId = remoteUserId;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    setStatus("connecting");

    let dataChannel: RTCDataChannel;
    if (polite) {
      dataChannel = pc.createDataChannel("opentube", {
        ordered: true,
        maxRetransmits: 3,
      });
      setupDataChannel(dataChannel);
    } else {
      pc.ondatachannel = (e) => {
        setupDataChannel(e.channel);
      };
    }
    dcRef.current = dataChannel!;

    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      try {
        await sendFn({
          data: {
            receiverId: peerId,
            roomId,
            payload: { type: "ice", candidate: e.candidate.toJSON() },
          },
        });
      } catch {
        // signaling is best-effort
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setStatus("connected");
      else if (state === "failed" || state === "closed") setStatus(state === "failed" ? "failed" : "disconnected");
    };

    async function setupDataChannel(dc: RTCDataChannel) {
      dcRef.current = dc;
      dc.onopen = () => {
        setStatus("connected");
        deriveSharedKeyIfPossible();
      };
      dc.onclose = () => setStatus("disconnected");
      dc.onmessage = async (e) => {
        let text = e.data as string;
        let encrypted = false;
        if (sharedKeyRef.current && text.startsWith("enc:")) {
          try {
            const [, iv, ct] = text.split(":");
            text = await aesDecrypt(sharedKeyRef.current, iv, ct);
            encrypted = true;
          } catch {
            // fallback to raw text
          }
        }
        setMessages((prev) => [
          ...prev,
          { senderId: peerId, text, encrypted, timestamp: Date.now() },
        ]);
      };
    }

    async function deriveSharedKeyIfPossible() {
      if (!remotePublicKey || !identity) return;
      try {
        const ecdhJwk = remotePublicKey.ecdh as JsonWebKey;
        if (!ecdhJwk) return;
        const remotePub = await importEcdhPublicKey(ecdhJwk);
        const privateKeys = await importPrivateKeys(identity.privateKey);
        sharedKeyRef.current = await deriveSharedKey(privateKeys.ecdh, remotePub);
      } catch {
        sharedKeyRef.current = null;
      }
    }

    async function negotiate() {
      if (!polite) return;
      setStatus("signaling");
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendFn({
          data: {
            receiverId: remoteUserId,
            roomId,
            payload: { type: "offer", sdp: offer.sdp },
          },
        });
      } catch {
        setStatus("failed");
      }
    }

    async function handleSignal(signal: { id: string; payload: SignalPayload }) {
      if (processedRef.current.has(signal.id)) return;
      processedRef.current.add(signal.id);
      try {
        await deleteFn({ data: { signalId: signal.id } });
      } catch {
        // best-effort cleanup
      }
      try {
        if (signal.payload.type === "offer") {
          if (polite) return; // ignore our own offers
          setStatus("signaling");
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: "offer",
            sdp: signal.payload.sdp,
          }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendFn({
            data: {
              receiverId: remoteUserId,
              roomId,
              payload: { type: "answer", sdp: answer.sdp },
            },
          });
        } else if (signal.payload.type === "answer") {
          if (polite) {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: "answer",
              sdp: signal.payload.sdp,
            }));
          }
        } else if (signal.payload.type === "ice" && signal.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload.candidate));
          } catch {
            // ignore stale candidates
          }
        }
      } catch {
        setStatus("failed");
      }
    }

    async function poll() {
      if (!roomId) return;
      try {
        const { signals } = await pollFn({ data: { roomId } });
        for (const s of signals) {
          await handleSignal({ id: s.id, payload: s.payload });
        }
      } catch {
        // polling continues
      }
    }

    // Start polite negotiation after a short delay so both sides are ready.
    const negotiateTimer = window.setTimeout(negotiate, 800);
    timerRef.current = window.setInterval(poll, SIGNAL_POLL_MS);
    poll();

    return () => {
      window.clearTimeout(negotiateTimer);
      if (timerRef.current) window.clearInterval(timerRef.current);
      pc.close();
    };
  }, [roomId, remoteUserId, polite, identity, pollFn, sendFn, deleteFn]);

  const connect = () => {
    // Connection lifecycle is handled by the hook; this lets UI re-trigger.
    if (pcRef.current && pcRef.current.connectionState === "failed") {
      pcRef.current.close();
    }
  };

  const send = async (text: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      throw new Error("No hay conexión P2P abierta.");
    }
    let payload = text;
    if (sharedKeyRef.current) {
      const { iv, ciphertext } = await aesEncrypt(sharedKeyRef.current, text);
      payload = `enc:${iv}:${ciphertext}`;
    }
    dc.send(payload);
    setMessages((prev) => [
      ...prev,
      { senderId: "me", text, encrypted: !!sharedKeyRef.current, timestamp: Date.now() },
    ]);
  };

  const close = () => {
    pcRef.current?.close();
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  return { status, messages, connect, send, close };
}

export default usePeerConnection;
