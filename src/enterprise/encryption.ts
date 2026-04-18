/**
 * Encryption utilities for tenant data isolation.
 *
 * Uses AES-256-GCM with per-tenant keys. The key hierarchy:
 *   Master Key (env var) → encrypts → Tenant Keys → encrypts → Data
 *
 * This module is side-effect-free: callers provide keys explicitly.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EncryptionEnvelope = {
  /** Envelope format version. */
  v: 1;
  /** Initialization vector (base64). */
  iv: string;
  /** GCM auth tag (base64). */
  tag: string;
  /** Ciphertext (base64). */
  ct: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit key from a passphrase and salt using scrypt.
 * Used for deriving the master key from an environment variable.
 */
export function deriveKey(passphrase: string, salt: string): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

/**
 * Generate a random 256-bit key for a new tenant.
 */
export function generateTenantKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Create a deterministic salt from a tenant ID.
 */
export function tenantSalt(tenantId: string): string {
  return createHash("sha256").update(`openclaw-enterprise:tenant:${tenantId}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * @param key - 32-byte encryption key
 * @param plaintext - data to encrypt
 * @returns Envelope with base64-encoded fields
 */
export function encrypt(key: Buffer, plaintext: Buffer): EncryptionEnvelope {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ciphertext.toString("base64"),
  };
}

/**
 * Decrypt an AES-256-GCM envelope.
 *
 * @param key - 32-byte encryption key (must match the one used to encrypt)
 * @param envelope - encrypted data envelope
 * @returns Decrypted plaintext
 * @throws If the key is wrong, data is tampered, or format is invalid
 */
export function decrypt(key: Buffer, envelope: EncryptionEnvelope): Buffer {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${String(envelope.v)}`);
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ct, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${TAG_LENGTH}, got ${tag.length}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a tenant key with the master key for safe storage.
 */
export function encryptTenantKey(masterKey: Buffer, tenantKey: Buffer): EncryptionEnvelope {
  return encrypt(masterKey, tenantKey);
}

/**
 * Decrypt a tenant key using the master key.
 */
export function decryptTenantKey(masterKey: Buffer, envelope: EncryptionEnvelope): Buffer {
  return decrypt(masterKey, envelope);
}

/**
 * Encrypt arbitrary JSON data for a tenant.
 */
export function encryptJson(key: Buffer, data: unknown): EncryptionEnvelope {
  return encrypt(key, Buffer.from(JSON.stringify(data), "utf-8"));
}

/**
 * Decrypt JSON data for a tenant.
 */
export function decryptJson<T = unknown>(key: Buffer, envelope: EncryptionEnvelope): T {
  const plaintext = decrypt(key, envelope);
  return JSON.parse(plaintext.toString("utf-8")) as T;
}
