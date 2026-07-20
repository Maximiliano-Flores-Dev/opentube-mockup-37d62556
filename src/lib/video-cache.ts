/**
 * Encrypted local video cache.
 *
 * The player streams the source once from the origin (Supabase Storage signed
 * URL, external URL, etc.), stores the bytes encrypted at rest in IndexedDB
 * with the device key, and serves subsequent playbacks from a local
 * `blob:` URL. A cached video makes the browser a WebRTC seeder for the
 * swarm (see `seeders.functions.ts`).
 *
 * Embeds (YouTube/Vimeo iframes) are NOT cached because the payload is not
 * reachable as bytes and the provider terms forbid re-serving. Only `file`
 * and `url` source kinds are eligible.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { aesDecryptBytes, aesEncryptBytes } from "./crypto";
import { getOrCreateDeviceKey, setMeta, getMeta } from "./local-db";

const DB_NAME = "opentube_vault";
const DB_VERSION = 2;
const DATA_STORE = "data";
const META_STORE = "meta";
const VIDEO_STORE = "videos";
const DEVICE_KEY = "opentube:device-key";

type EncryptedBlob = { iv: string; ciphertext: string; mimeType: string; byteLength: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB no está disponible."));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    };
  });
  return dbPromise;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Users on public devices should not persist videos to disk. */
async function getDeviceKey(): Promise<CryptoKey> {
  // Cached videos are only stored under the persistent (non-guest) key path.
  const raw = safeStorage()?.getItem(DEVICE_KEY);
  if (!raw) return getOrCreateDeviceKey(false);
  return getOrCreateDeviceKey(false);
}

async function putVideoRecord(key: string, value: EncryptedBlob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, "readwrite");
  tx.objectStore(VIDEO_STORE).put(value, key);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getVideoRecord(key: string): Promise<EncryptedBlob | null> {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, "readonly");
  const req = tx.objectStore(VIDEO_STORE).get(key);
  return new Promise((res, rej) => {
    req.onsuccess = () => res((req.result as EncryptedBlob | undefined) ?? null);
    req.onerror = () => rej(req.error);
  });
}

async function deleteVideoRecord(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, "readwrite");
  tx.objectStore(VIDEO_STORE).delete(key);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** List all cached video ids. */
export async function listCachedVideos(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, "readonly");
  const req = tx.objectStore(VIDEO_STORE).getAllKeys();
  return new Promise((res, rej) => {
    req.onsuccess = () => res((req.result as string[]) ?? []);
    req.onerror = () => rej(req.error);
  });
}

/** Total cached bytes (approximate, from stored byteLength markers). */
export async function cachedBytes(): Promise<number> {
  const ids = await listCachedVideos();
  let total = 0;
  for (const id of ids) {
    const rec = await getVideoRecord(id);
    if (rec) total += rec.byteLength;
  }
  return total;
}

/** Decrypt a cached video and return a blob URL. */
async function decryptToBlobUrl(rec: EncryptedBlob): Promise<string> {
  const key = await getDeviceKey();
  const bin = await aesDecryptBytes(key, rec.iv, rec.ciphertext);
  const blob = new Blob([bin], { type: rec.mimeType || "video/mp4" });
  return URL.createObjectURL(blob);
}

async function encryptAndStore(id: string, buf: ArrayBuffer, mimeType: string): Promise<void> {
  const key = await getDeviceKey();
  const { iv, ciphertext } = await aesEncryptBytes(key, buf);
  await putVideoRecord(id, {
    iv,
    ciphertext,
    mimeType,
    byteLength: buf.byteLength,
  });
  const meta = ((await getMeta<Record<string, unknown>>("videos:index")) ?? {}) as Record<string, unknown>;
  meta[id] = { cachedAt: new Date().toISOString(), bytes: buf.byteLength, mimeType };
  await setMeta("videos:index", meta);
}

export type CacheStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "cached"; blobUrl: string; bytes: number }
  | { phase: "downloading"; received: number; total: number }
  | { phase: "error"; message: string };

/**
 * Ensure the video is cached locally. If already cached, returns a blob URL
 * immediately. Otherwise streams the origin URL, encrypts, and stores it.
 */
export function useCachedVideo(
  videoId: string,
  originUrl: string,
  mimeType: string,
  eligible: boolean,
): { status: CacheStatus; forget: () => Promise<void> } {
  const [status, setStatus] = useState<CacheStatus>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!eligible || !videoId || !originUrl) {
      setStatus({ phase: "idle" });
      return () => {
        cancelled = true;
      };
    }

    setStatus({ phase: "checking" });

    (async () => {
      try {
        const existing = await getVideoRecord(videoId);
        if (existing && !cancelled) {
          const url = await decryptToBlobUrl(existing);
          blobUrlRef.current = url;
          setStatus({ phase: "cached", blobUrl: url, bytes: existing.byteLength });
          return;
        }

        const ac = new AbortController();
        abortRef.current = ac;
        const res = await fetch(originUrl, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const total = Number(res.headers.get("content-length") ?? 0);
        const reader = res.body?.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              if (!cancelled) setStatus({ phase: "downloading", received, total });
            }
          }
        } else {
          const buf = new Uint8Array(await res.arrayBuffer());
          chunks.push(buf);
          received = buf.byteLength;
        }

        const merged = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        if (cancelled) return;

        await encryptAndStore(videoId, merged.buffer, mimeType || res.headers.get("content-type") || "video/mp4");
        const rec = await getVideoRecord(videoId);
        if (!rec || cancelled) return;
        const url = await decryptToBlobUrl(rec);
        blobUrlRef.current = url;
        setStatus({ phase: "cached", blobUrl: url, bytes: rec.byteLength });
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Fallo al cachear el video";
        setStatus({ phase: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [videoId, originUrl, mimeType, eligible]);

  const forget = useMemo(
    () => async () => {
      await deleteVideoRecord(videoId);
      const meta = ((await getMeta<Record<string, unknown>>("videos:index")) ?? {}) as Record<string, unknown>;
      delete meta[videoId];
      await setMeta("videos:index", meta);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setStatus({ phase: "idle" });
    },
    [videoId],
  );

  return { status, forget };
}
