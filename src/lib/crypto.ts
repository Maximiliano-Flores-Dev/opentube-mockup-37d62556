/**
 * OpenTube cryptographic toolkit.
 *
 * Uses the Web Crypto API (SubtleCrypto) for all operations:
 * - AES-GCM-256 for symmetric encryption at rest.
 * - ECDH (P-256) for key agreement.
 * - ECDSA (P-256) for signatures.
 * - PBKDF2 for password-based key derivation.
 *
 * All operations are async and run in the browser. No private key material
 * leaves the device unencrypted.
 */

const AES_ALGO = { name: "AES-GCM", length: 256 } as const;
const ECDH_ALGO = { name: "ECDH", namedCurve: "P-256" } as const;
const ECDSA_ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;
const PBKDF2_PARAMS = { name: "PBKDF2", hash: "SHA-256", iterations: 250_000 } as const;

export type PublicKeyBundle = {
  ecdh: JsonWebKey;
  ecdsa: JsonWebKey;
  createdAt: number;
};

export type PrivateKeyBundle = {
  ecdh: JsonWebKey;
  ecdsa: JsonWebKey;
};

function getSubtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto API no está disponible. Usa un navegador moderno.");
  }
  return crypto.subtle;
}

/** Generate a random buffer of n bytes. */
export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n)) as Uint8Array;
}

/** Convert a Uint8Array to a base64 string. */
export function toBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.byteLength; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

/** Convert a base64 string to a Uint8Array. */
export function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Derive a 256-bit AES key from a password and salt using PBKDF2. */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    { ...PBKDF2_PARAMS, salt: salt as BufferSource },
    baseKey,
    AES_ALGO,
    false,
    ["encrypt", "decrypt"],
  );
}

/** Generate a new AES-256 key for local data encryption. */
export async function generateAesKey(): Promise<CryptoKey> {
  return getSubtle().generateKey(AES_ALGO, true, ["encrypt", "decrypt"]);
}

/** Encrypt plaintext with AES-GCM. Returns `{ iv, ciphertext }` as base64. */
export async function aesEncrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: string; ciphertext: string }> {
  const subtle = getSubtle();
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource,
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ct)) };
}

/** Decrypt ciphertext with AES-GCM. */
export async function aesDecrypt(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
): Promise<string> {
  const subtle = getSubtle();
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) as BufferSource },
    key,
    fromBase64(ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** Encrypt raw bytes with AES-GCM. Returns `{ iv, ciphertext }` as base64. */
export async function aesEncryptBytes(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ iv: string; ciphertext: string }> {
  const subtle = getSubtle();
  const iv = randomBytes(12);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data,
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ct)) };
}

/** Decrypt AES-GCM ciphertext back to raw bytes. */
export async function aesDecryptBytes(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
): Promise<ArrayBuffer> {
  const subtle = getSubtle();
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) as BufferSource },
    key,
    fromBase64(ciphertext) as BufferSource,
  );
  return plain as ArrayBuffer;
}

/** Export a CryptoKey as JWK. */
export async function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  return getSubtle().exportKey("jwk", key);
}

/** Import a public ECDH key from JWK. */
export async function importEcdhPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return getSubtle().importKey("jwk", jwk, ECDH_ALGO, true, []);
}

/** Import a public ECDSA key from JWK. */
export async function importEcdsaPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return getSubtle().importKey("jwk", jwk, ECDSA_ALGO, true, ["verify"]);
}

/** Generate a new ECDH key pair. */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey(ECDH_ALGO, true, ["deriveKey", "deriveBits"]);
}

/** Generate a new ECDSA key pair. */
export async function generateEcdsaKeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey(ECDSA_ALGO, true, ["sign", "verify"]);
}

/**
 * Derive a shared AES-256 key from our ECDH private key and a peer's ECDH
 * public key. This is the core of the E2EE handshake.
 */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  return getSubtle().deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    AES_ALGO,
    false,
    ["encrypt", "decrypt"],
  );
}

/** Sign data with our ECDSA private key. */
export async function sign(privateKey: CryptoKey, data: string): Promise<string> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const sig = await subtle.sign(
    SIGN_PARAMS,
    privateKey,
    enc.encode(data) as BufferSource,
  );
  return toBase64(new Uint8Array(sig));
}

/** Verify a signature with a peer's ECDSA public key. */
export async function verify(
  publicKey: CryptoKey,
  data: string,
  signatureBase64: string,
): Promise<boolean> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  try {
    return await subtle.verify(
      SIGN_PARAMS,
      publicKey,
      fromBase64(signatureBase64) as BufferSource,
      enc.encode(data) as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Hash a string with SHA-256, returning a base64 digest. */
export async function sha256(input: string): Promise<string> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const buf = await subtle.digest("SHA-256", enc.encode(input) as BufferSource);
  return toBase64(new Uint8Array(buf));
}
