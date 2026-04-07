/**
 * crypto.test.ts
 *
 * Unit tests for all cryptographic operations in crypto.ts.
 * Uses Node.js built-in Web Crypto API (available in Node 18+).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateIdentityKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  keyFingerprint,
  bufferToBase64,
  base64ToBuffer,
} from '../crypto';

// ─── Helper Utilities ────────────────────────────────────────────────────────

describe('bufferToBase64 / base64ToBuffer', () => {
  it('should round-trip arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const b64 = bufferToBase64(original);
    const restored = base64ToBuffer(b64);
    expect(restored).toEqual(original);
  });

  it('should handle empty input', () => {
    const empty = new Uint8Array(0);
    const b64 = bufferToBase64(empty);
    const restored = base64ToBuffer(b64);
    expect(restored).toEqual(empty);
  });

  it('should handle ArrayBuffer input', () => {
    const buf = new Uint8Array([10, 20, 30]).buffer;
    const b64 = bufferToBase64(buf);
    const restored = base64ToBuffer(b64);
    expect(restored).toEqual(new Uint8Array([10, 20, 30]));
  });
});

// ─── Key Generation ──────────────────────────────────────────────────────────

describe('generateIdentityKeyPair', () => {
  it('should generate a key pair with public and private keys', async () => {
    const pair = await generateIdentityKeyPair();
    expect(pair.publicKey).toBeDefined();
    expect(pair.privateKey).toBeDefined();
    expect(pair.publicKey.type).toBe('public');
    expect(pair.privateKey.type).toBe('private');
  });

  it('should generate different key pairs on each call', async () => {
    const pair1 = await generateIdentityKeyPair();
    const pair2 = await generateIdentityKeyPair();
    const raw1 = await exportPublicKey(pair1.publicKey);
    const raw2 = await exportPublicKey(pair2.publicKey);
    expect(raw1).not.toBe(raw2);
  });

  it('should generate ECDH P-256 keys', async () => {
    const pair = await generateIdentityKeyPair();
    expect(pair.publicKey.algorithm).toMatchObject({
      name: 'ECDH',
      namedCurve: 'P-256',
    });
  });
});

// ─── Key Export / Import ─────────────────────────────────────────────────────

describe('exportPublicKey / importPublicKey', () => {
  it('should round-trip a public key through export and import', async () => {
    const pair = await generateIdentityKeyPair();
    const exported = await exportPublicKey(pair.publicKey);

    // P-256 uncompressed public key = 65 bytes → 88 base64 chars
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);

    const imported = await importPublicKey(exported);
    expect(imported.type).toBe('public');

    // Re-export and compare
    const reExported = await exportPublicKey(imported);
    expect(reExported).toBe(exported);
  });

  it('should reject invalid base64 as a public key', async () => {
    await expect(importPublicKey('not-a-valid-key!!!')).rejects.toThrow();
  });
});

describe('exportPrivateKey / importPrivateKey', () => {
  it('should round-trip a private key through JWK export and import', async () => {
    const pair = await generateIdentityKeyPair();
    const exported = await exportPrivateKey(pair.privateKey);

    // Should be a valid JSON string containing JWK fields
    const jwk = JSON.parse(exported);
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.d).toBeDefined(); // private component

    const imported = await importPrivateKey(exported);
    expect(imported.type).toBe('private');
  });

  it('should produce a usable private key after round-trip', async () => {
    const pairA = await generateIdentityKeyPair();
    const pairB = await generateIdentityKeyPair();

    // Export and re-import A's private key
    const exported = await exportPrivateKey(pairA.privateKey);
    const reimported = await importPrivateKey(exported);

    // Derive shared keys using original and reimported private keys
    const sharedOriginal = await deriveSharedKey(
      pairA.privateKey,
      pairB.publicKey,
    );
    const sharedReimported = await deriveSharedKey(reimported, pairB.publicKey);

    // Both should decrypt the same ciphertext
    const { ciphertext, iv } = await encryptMessage(sharedOriginal, 'test');
    const decrypted = await decryptMessage(sharedReimported, ciphertext, iv);
    expect(decrypted).toBe('test');
  });
});

// ─── Shared Secret Derivation ────────────────────────────────────────────────

describe('deriveSharedKey', () => {
  it('should derive the same shared key from both sides (ECDH symmetry)', async () => {
    const pairA = await generateIdentityKeyPair();
    const pairB = await generateIdentityKeyPair();

    // A derives with (A.private, B.public)
    const sharedAB = await deriveSharedKey(pairA.privateKey, pairB.publicKey);
    // B derives with (B.private, A.public)
    const sharedBA = await deriveSharedKey(pairB.privateKey, pairA.publicKey);

    // Encrypt with A's key, decrypt with B's key
    const plaintext = 'Hello, ECDH!';
    const { ciphertext, iv } = await encryptMessage(sharedAB, plaintext);
    const decrypted = await decryptMessage(sharedBA, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('should derive different shared keys with different peers', async () => {
    const pairA = await generateIdentityKeyPair();
    const pairB = await generateIdentityKeyPair();
    const pairC = await generateIdentityKeyPair();

    const sharedAB = await deriveSharedKey(pairA.privateKey, pairB.publicKey);
    const sharedAC = await deriveSharedKey(pairA.privateKey, pairC.publicKey);

    // Encrypt with AB, should fail to decrypt with AC
    const { ciphertext, iv } = await encryptMessage(sharedAB, 'secret');
    await expect(decryptMessage(sharedAC, ciphertext, iv)).rejects.toThrow();
  });

  it('should work with imported public keys (simulating network exchange)', async () => {
    const pairA = await generateIdentityKeyPair();
    const pairB = await generateIdentityKeyPair();

    // Simulate: A exports pubkey → sends over network → B imports it
    const aPubRaw = await exportPublicKey(pairA.publicKey);
    const bPubRaw = await exportPublicKey(pairB.publicKey);

    const aPubImported = await importPublicKey(aPubRaw);
    const bPubImported = await importPublicKey(bPubRaw);

    const sharedA = await deriveSharedKey(pairA.privateKey, bPubImported);
    const sharedB = await deriveSharedKey(pairB.privateKey, aPubImported);

    const { ciphertext, iv } = await encryptMessage(sharedA, 'network test');
    const decrypted = await decryptMessage(sharedB, ciphertext, iv);
    expect(decrypted).toBe('network test');
  });
});

// ─── Encryption / Decryption ─────────────────────────────────────────────────

describe('encryptMessage / decryptMessage', () => {
  let sharedKey: CryptoKey;

  // Create a shared key once for this suite
  beforeAll(async () => {
    const pairA = await generateIdentityKeyPair();
    const pairB = await generateIdentityKeyPair();
    sharedKey = await deriveSharedKey(pairA.privateKey, pairB.publicKey);
  });

  it('should encrypt and decrypt a simple message', async () => {
    const plaintext = 'Hello, World!';
    const { ciphertext, iv } = await encryptMessage(sharedKey, plaintext);
    const decrypted = await decryptMessage(sharedKey, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt an empty string', async () => {
    const { ciphertext, iv } = await encryptMessage(sharedKey, '');
    const decrypted = await decryptMessage(sharedKey, ciphertext, iv);
    expect(decrypted).toBe('');
  });

  it('should encrypt and decrypt unicode / emoji content', async () => {
    const plaintext = '🔐 Xin chào thế giới! 你好世界 🌍';
    const { ciphertext, iv } = await encryptMessage(sharedKey, plaintext);
    const decrypted = await decryptMessage(sharedKey, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt a long message', async () => {
    const plaintext = 'A'.repeat(10_000);
    const { ciphertext, iv } = await encryptMessage(sharedKey, plaintext);
    const decrypted = await decryptMessage(sharedKey, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same plaintext (unique IVs)', async () => {
    const plaintext = 'same message';
    const enc1 = await encryptMessage(sharedKey, plaintext);
    const enc2 = await encryptMessage(sharedKey, plaintext);

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('should produce base64 strings for ciphertext and iv', async () => {
    const { ciphertext, iv } = await encryptMessage(sharedKey, 'test');
    // base64 characters only
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should fail to decrypt with a wrong key', async () => {
    const pairC = await generateIdentityKeyPair();
    const pairD = await generateIdentityKeyPair();
    const wrongKey = await deriveSharedKey(pairC.privateKey, pairD.publicKey);

    const { ciphertext, iv } = await encryptMessage(sharedKey, 'secret');
    await expect(decryptMessage(wrongKey, ciphertext, iv)).rejects.toThrow();
  });

  it('should fail to decrypt with tampered ciphertext', async () => {
    const { ciphertext, iv } = await encryptMessage(
      sharedKey,
      'integrity test',
    );

    // Flip a character in the middle of the ciphertext
    const tampered =
      ciphertext.slice(0, 5) +
      (ciphertext[5] === 'A' ? 'B' : 'A') +
      ciphertext.slice(6);

    await expect(decryptMessage(sharedKey, tampered, iv)).rejects.toThrow();
  });

  it('should fail to decrypt with tampered IV', async () => {
    const { ciphertext, iv } = await encryptMessage(sharedKey, 'iv test');

    const tampered = iv.slice(0, 2) + (iv[2] === 'A' ? 'B' : 'A') + iv.slice(3);

    await expect(
      decryptMessage(sharedKey, ciphertext, tampered),
    ).rejects.toThrow();
  });
});

// ─── Fingerprint ─────────────────────────────────────────────────────────────

describe('keyFingerprint', () => {
  it('should return a formatted 16-hex-char fingerprint', async () => {
    const pair = await generateIdentityKeyPair();
    const raw = await exportPublicKey(pair.publicKey);
    const fp = await keyFingerprint(raw);

    // Format: "XXXX XXXX XXXX XXXX" → 19 chars total
    expect(fp).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
  });

  it('should produce the same fingerprint for the same key', async () => {
    const pair = await generateIdentityKeyPair();
    const raw = await exportPublicKey(pair.publicKey);
    const fp1 = await keyFingerprint(raw);
    const fp2 = await keyFingerprint(raw);
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprints for different keys', async () => {
    const pair1 = await generateIdentityKeyPair();
    const pair2 = await generateIdentityKeyPair();
    const raw1 = await exportPublicKey(pair1.publicKey);
    const raw2 = await exportPublicKey(pair2.publicKey);
    const fp1 = await keyFingerprint(raw1);
    const fp2 = await keyFingerprint(raw2);
    expect(fp1).not.toBe(fp2);
  });

  it('should produce the same fingerprint after export → import → re-export', async () => {
    const pair = await generateIdentityKeyPair();
    const raw = await exportPublicKey(pair.publicKey);
    const imported = await importPublicKey(raw);
    const reExported = await exportPublicKey(imported);

    const fp1 = await keyFingerprint(raw);
    const fp2 = await keyFingerprint(reExported);
    expect(fp1).toBe(fp2);
  });
});

// ─── Full E2E Crypto Pipeline ────────────────────────────────────────────────

describe('full crypto pipeline (key gen → exchange → encrypt → decrypt)', () => {
  it('should simulate a complete two-party message exchange', async () => {
    // 1. Both parties generate key pairs
    const alice = await generateIdentityKeyPair();
    const bob = await generateIdentityKeyPair();

    // 2. Export public keys (simulates sending over network)
    const alicePubRaw = await exportPublicKey(alice.publicKey);
    const bobPubRaw = await exportPublicKey(bob.publicKey);

    // 3. Import the other party's public key
    const aliceImportsBob = await importPublicKey(bobPubRaw);
    const bobImportsAlice = await importPublicKey(alicePubRaw);

    // 4. Derive shared keys
    const aliceShared = await deriveSharedKey(
      alice.privateKey,
      aliceImportsBob,
    );
    const bobShared = await deriveSharedKey(bob.privateKey, bobImportsAlice);

    // 5. Alice sends a message to Bob
    const aliceMsg = 'Hey Bob, this is encrypted!';
    const encrypted = await encryptMessage(aliceShared, aliceMsg);
    const bobReceives = await decryptMessage(
      bobShared,
      encrypted.ciphertext,
      encrypted.iv,
    );
    expect(bobReceives).toBe(aliceMsg);

    // 6. Bob replies to Alice
    const bobMsg = 'Got it, Alice! 🔒';
    const bobEncrypted = await encryptMessage(bobShared, bobMsg);
    const aliceReceives = await decryptMessage(
      aliceShared,
      bobEncrypted.ciphertext,
      bobEncrypted.iv,
    );
    expect(aliceReceives).toBe(bobMsg);

    // 7. Verify fingerprints match for both
    const fpAlice = await keyFingerprint(alicePubRaw);
    const fpBob = await keyFingerprint(bobPubRaw);
    expect(fpAlice).not.toBe(fpBob); // different people = different fingerprints
    expect(fpAlice).toMatch(
      /^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/,
    );
  });
});
