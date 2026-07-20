/**
 * Encrypted local-first persistence layer.
 *
 * Uses IndexedDB for storage and AES-GCM-256 for encryption at rest. The
 * encryption key ("device key") is kept in a separate storage bucket from the
 * data, so a raw IndexedDB dump alone is not enough to decrypt the content.
 *
 * For the strongest threat model, the device key would live in the OS keychain
 * (WebAuthn, Secure Enclave, etc.). In a web app, the best practical option is
 * a random 256-bit key generated per browser profile and stored in
 * localStorage/sessionStorage. This protects against casual storage inspection
 * and malware that only reads the database file.
 */

import { aesDecrypt, aesEncrypt, generateAesKey, randomBytes, toBase64 } from "./crypto";

const DB_NAME = "opentube_vault";
const DB_VERSION = 1;
const DATA_STORE = "data";
const META_STORE = "meta";
const DEVICE_KEY = "opentube:device-key";
const GUEST_DEVICE_KEY = "opentube:guest-device-key";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB no está disponible en este entorno."));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
  });
  return dbPromise;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Generate and store a device key for the current browser profile. */
export async function getOrCreateDeviceKey(isGuest: boolean): Promise<CryptoKey> {
  const storage = isGuest ? safeSessionStorage() : safeStorage();
  const keyName = isGuest ? GUEST_DEVICE_KEY : DEVICE_KEY;
  if (!storage) throw new Error("No hay almacenamiento disponible para la clave de dispositivo.");

  const raw = storage.getItem(keyName);
  if (raw) {
    try {
      const jwk = JSON.parse(raw) as JsonWebKey;
      return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, [
        "encrypt",
        "decrypt",
      ]);
    } catch {
      // fallthrough to regenerate
    }
  }
  const key = await generateAesKey();
  const jwk = await crypto.subtle.exportKey("jwk", key);
  storage.setItem(keyName, JSON.stringify(jwk));
  return key;
}

/** Rotate the device key. This invalidates previously encrypted data. */
export async function rotateDeviceKey(isGuest: boolean): Promise<CryptoKey> {
  const storage = isGuest ? safeSessionStorage() : safeStorage();
  const keyName = isGuest ? GUEST_DEVICE_KEY : DEVICE_KEY;
  if (storage) storage.removeItem(keyName);
  return getOrCreateDeviceKey(isGuest);
}

/** Wipe all local encrypted data and device keys. */
export async function wipeLocalData(): Promise<void> {
  const ls = safeStorage();
  const ss = safeSessionStorage();
  if (ls) {
    ls.removeItem(DEVICE_KEY);
  }
  if (ss) {
    ss.removeItem(GUEST_DEVICE_KEY);
  }
  try {
    const db = await openDb();
    const tx = db.transaction([DATA_STORE, META_STORE], "readwrite");
    tx.objectStore(DATA_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("No se pudo limpiar IndexedDB"));
    });
  } catch {
    // ignore cleanup errors
  }
  dbPromise = null;
}

async function storeObject(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value, key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo escribir en IndexedDB"));
  });
}

async function getObject(storeName: string, key: string): Promise<unknown | undefined> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const req = store.get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("No se pudo leer de IndexedDB"));
  });
}

async function removeObject(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo eliminar de IndexedDB"));
  });
}

/** Encrypt and store a JSON-serializable value. */
export async function setItem(
  key: string,
  value: unknown,
  isGuest: boolean,
): Promise<void> {
  const dek = await getOrCreateDeviceKey(isGuest);
  const packed = JSON.stringify(value);
  const encrypted = await aesEncrypt(dek, packed);
  await storeObject(DATA_STORE, key, encrypted);
}

/** Read and decrypt a JSON-serializable value. */
export async function getItem<T = unknown>(key: string, isGuest: boolean): Promise<T | null> {
  try {
    const dek = await getOrCreateDeviceKey(isGuest);
    const encrypted = (await getObject(DATA_STORE, key)) as { iv: string; ciphertext: string } | undefined;
    if (!encrypted) return null;
    const packed = await aesDecrypt(dek, encrypted.iv, encrypted.ciphertext);
    return JSON.parse(packed) as T;
  } catch {
    return null;
  }
}

/** Remove an encrypted item. */
export async function removeItem(key: string): Promise<void> {
  await removeObject(DATA_STORE, key);
}

/** List all keys currently stored in the encrypted data store. */
export async function keys(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(DATA_STORE, "readonly");
  const store = tx.objectStore(DATA_STORE);
  const req = store.getAllKeys();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("No se pudo listar IndexedDB"));
  });
}

/** Store a small unencrypted metadata entry (e.g., key references). */
export async function setMeta(key: string, value: unknown): Promise<void> {
  await storeObject(META_STORE, key, value);
}

/** Read a metadata entry. */
export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const value = await getObject(META_STORE, key);
  return value as T | null;
}

/** Export a compact summary of the vault for debugging/audits. */
export async function vaultSummary(): Promise<{
  dataKeys: string[];
  metaKeys: string[];
  deviceKeyPresent: { local: boolean; session: boolean };
}> {
  const dataKeys = await keys();
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const metaReq = tx.objectStore(META_STORE).getAllKeys();
  const metaKeys = await new Promise<string[]>((resolve, reject) => {
    metaReq.onsuccess = () => resolve((metaReq.result as string[]) ?? []);
    metaReq.onerror = () => reject(metaReq.error ?? new Error("Meta list error"));
  });
  return {
    dataKeys,
    metaKeys,
    deviceKeyPresent: {
      local: !!safeStorage()?.getItem(DEVICE_KEY),
      session: !!safeSessionStorage()?.getItem(GUEST_DEVICE_KEY),
    },
  };
}
