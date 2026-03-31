/**
 * crypto.ts
 * All cryptographic operations using the browser-native Web Crypto API.
 * No external crypto dependencies.
 *
 * Improvements:
 *  - IV is always 96-bit random (guaranteed unique per encrypt call).
 *  - Keys are P-256 ECDH (wide support, FIPS-approved).
 *  - AES-GCM provides authenticated encryption; tampering is detected.
 *  - Public key fingerprint is first 8 bytes of SHA-256 (16 hex chars).
 */

const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 };

// ─── Key Generation ───────────────────────────────────────────────────────────

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey']);
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(base64);
  return crypto.subtle.importKey('raw', raw, ECDH_PARAMS, true, []);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importPrivateKey(json: string): Promise<CryptoKey> {
  const jwk = JSON.parse(json) as JsonWebKey;
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, true, ['deriveKey']);
}

// ─── Shared Secret Derivation ─────────────────────────────────────────────────

export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    AES_PARAMS,
    false, // non-extractable — key never leaves memory
    ['encrypt', 'decrypt'],
  );
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

export async function encryptMessage(
  sharedKey: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random IV
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded,
  );
  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv),
  };
}

export async function decryptMessage(
  sharedKey: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    sharedKey,
    base64ToBuffer(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

/**
 * Returns a short human-readable fingerprint of a public key.
 * First 8 bytes (16 hex chars) of SHA-256(publicKeyBytes).
 * Used so users can visually verify they're talking to the right peer.
 */
export async function keyFingerprint(publicKeyRaw: string): Promise<string> {
  const raw = base64ToBuffer(publicKeyRaw);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Format as groups of 4: XXXX XXXX XXXX XXXX
  return hex.slice(0, 16).replace(/(.{4})/g, '$1 ').trim().toUpperCase();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}