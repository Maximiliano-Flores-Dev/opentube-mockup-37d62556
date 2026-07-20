/**
 * OpenTube local identity manager.
 *
 * Each browser profile (guest or authenticated user) gets its own cryptographic
 * identity: an ECDH key pair for key agreement and an ECDSA key pair for
 * signatures. The private keys are stored encrypted in IndexedDB under the
 * local device key; the public keys can be published to the Supabase
 * `crypto_identities` table for peer discovery.
 *
 * This is the foundation of real end-to-end encryption between users.
 */

import {
  exportJwk,
  generateEcdhKeyPair,
  generateEcdsaKeyPair,
  importEcdhPublicKey,
  importEcdsaPublicKey,
  type PrivateKeyBundle,
  type PublicKeyBundle,
} from "./crypto";
import { getItem, getMeta, setItem, setMeta } from "./local-db";

const IDENTITY_KEY = "opentube:identity";
const PUBLISHED_FINGERPRINT = "opentube:published-fingerprint";

export type Identity = {
  userId: string | "guest";
  publicKey: PublicKeyBundle;
  privateKey: PrivateKeyBundle;
  fingerprint: string;
};

/** Create a deterministic fingerprint from two public JWKs. */
function fingerprint(ecdh: JsonWebKey, ecdsa: JsonWebKey): string {
  const raw = JSON.stringify([ecdh.x, ecdsa.x].sort());
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/** Generate a brand-new identity. */
export async function generateIdentity(userId: string | "guest"): Promise<Identity> {
  const [ecdhPair, ecdsaPair] = await Promise.all([
    generateEcdhKeyPair(),
    generateEcdsaKeyPair(),
  ]);
  const [ecdhPublic, ecdsaPublic, ecdhPrivate, ecdsaPrivate] = await Promise.all([
    exportJwk(ecdhPair.publicKey),
    exportJwk(ecdsaPair.publicKey),
    exportJwk(ecdhPair.privateKey),
    exportJwk(ecdsaPair.privateKey),
  ]);
  const publicKey: PublicKeyBundle = {
    ecdh: ecdhPublic,
    ecdsa: ecdsaPublic,
    createdAt: Date.now(),
  };
  const privateKey: PrivateKeyBundle = { ecdh: ecdhPrivate, ecdsa: ecdsaPrivate };
  return {
    userId,
    publicKey,
    privateKey,
    fingerprint: fingerprint(ecdhPublic, ecdsaPublic),
  };
}

/** Load the identity for the current user/guest, creating it if needed. */
export async function loadIdentity(userId: string | "guest", isGuest: boolean): Promise<Identity> {
  const stored = await getItem<Identity>(IDENTITY_KEY, isGuest);
  if (stored && stored.userId === userId) {
    return stored;
  }
  const identity = await generateIdentity(userId);
  await setItem(IDENTITY_KEY, identity, isGuest);
  return identity;
}

/** Re-key the current identity (rarely needed). */
export async function rotateIdentity(userId: string | "guest", isGuest: boolean): Promise<Identity> {
  const identity = await generateIdentity(userId);
  await setItem(IDENTITY_KEY, identity, isGuest);
  await setMeta(PUBLISHED_FINGERPRINT, null);
  return identity;
}

/** Remember whether we have already published this identity to Supabase. */
export async function markPublished(fingerprint: string): Promise<void> {
  await setMeta(PUBLISHED_FINGERPRINT, fingerprint);
}

export async function getPublishedFingerprint(): Promise<string | null> {
  return await getMeta<string>(PUBLISHED_FINGERPRINT);
}

/** Re-import the public key CryptoKeys from a bundle. */
export async function importPublicKeys(bundle: PublicKeyBundle) {
  return {
    ecdh: await importEcdhPublicKey(bundle.ecdh),
    ecdsa: await importEcdsaPublicKey(bundle.ecdsa),
  };
}

/** Re-import the private key CryptoKeys from a bundle. */
export async function importPrivateKeys(bundle: PrivateKeyBundle) {
  return {
    ecdh: await crypto.subtle.importKey(
      "jwk",
      bundle.ecdh,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    ),
    ecdsa: await crypto.subtle.importKey(
      "jwk",
      bundle.ecdsa,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ),
  };
}
