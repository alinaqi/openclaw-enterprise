import { describe, expect, it } from "vitest";
import {
  decrypt,
  decryptJson,
  decryptTenantKey,
  deriveKey,
  encrypt,
  encryptJson,
  encryptTenantKey,
  generateTenantKey,
  tenantSalt,
} from "./encryption.js";

describe("encryption", () => {
  const key = generateTenantKey();

  // ---------- key generation ----------

  it("generates a 32-byte tenant key", () => {
    const k = generateTenantKey();
    expect(k).toBeInstanceOf(Buffer);
    expect(k.length).toBe(32);
  });

  it("generates unique keys each call", () => {
    const a = generateTenantKey();
    const b = generateTenantKey();
    expect(a.equals(b)).toBe(false);
  });

  // ---------- key derivation ----------

  it("derives a 32-byte key from passphrase and salt", () => {
    const derived = deriveKey("my-secret-passphrase", "my-salt");
    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);
  });

  it("derives the same key for the same inputs", () => {
    const a = deriveKey("pass", "salt");
    const b = deriveKey("pass", "salt");
    expect(a.equals(b)).toBe(true);
  });

  it("derives different keys for different passphrases", () => {
    const a = deriveKey("pass-a", "salt");
    const b = deriveKey("pass-b", "salt");
    expect(a.equals(b)).toBe(false);
  });

  // ---------- tenant salt ----------

  it("produces a deterministic hex salt from tenant ID", () => {
    const salt = tenantSalt("tenant-123");
    expect(typeof salt).toBe("string");
    expect(salt.length).toBe(64); // sha256 hex
    expect(tenantSalt("tenant-123")).toBe(salt);
  });

  it("produces different salts for different tenant IDs", () => {
    expect(tenantSalt("a")).not.toBe(tenantSalt("b"));
  });

  // ---------- encrypt / decrypt ----------

  it("round-trips plaintext through encrypt → decrypt", () => {
    const plaintext = Buffer.from("hello enterprise", "utf-8");
    const envelope = encrypt(key, plaintext);
    const decrypted = decrypt(key, envelope);
    expect(decrypted.toString("utf-8")).toBe("hello enterprise");
  });

  it("produces an envelope with correct structure", () => {
    const envelope = encrypt(key, Buffer.from("test"));
    expect(envelope.v).toBe(1);
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.tag).toBe("string");
    expect(typeof envelope.ct).toBe("string");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = Buffer.from("same input");
    const a = encrypt(key, plaintext);
    const b = encrypt(key, plaintext);
    expect(a.ct).not.toBe(b.ct);
  });

  it("throws on wrong key", () => {
    const envelope = encrypt(key, Buffer.from("secret"));
    const wrongKey = generateTenantKey();
    expect(() => decrypt(wrongKey, envelope)).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const envelope = encrypt(key, Buffer.from("data"));
    const tampered = { ...envelope, ct: "AAAA" + envelope.ct };
    expect(() => decrypt(key, tampered)).toThrow();
  });

  it("throws on invalid key length", () => {
    const shortKey = Buffer.alloc(16);
    expect(() => encrypt(shortKey, Buffer.from("test"))).toThrow(/must be 32 bytes/);
    expect(() => decrypt(shortKey, encrypt(key, Buffer.from("x")))).toThrow(/must be 32 bytes/);
  });

  it("throws on unsupported envelope version", () => {
    const envelope = encrypt(key, Buffer.from("test"));
    const bad = { ...envelope, v: 2 as const };
    // @ts-expect-error intentionally testing invalid version
    expect(() => decrypt(key, bad)).toThrow(/Unsupported envelope version/);
  });

  // ---------- tenant key encryption ----------

  it("encrypts and decrypts a tenant key with a master key", () => {
    const masterKey = generateTenantKey();
    const tenantKey = generateTenantKey();
    const encrypted = encryptTenantKey(masterKey, tenantKey);
    const decrypted = decryptTenantKey(masterKey, encrypted);
    expect(decrypted.equals(tenantKey)).toBe(true);
  });

  // ---------- JSON encrypt / decrypt ----------

  it("round-trips JSON data", () => {
    const data = { name: "Acme Corp", users: 42, nested: { flag: true } };
    const envelope = encryptJson(key, data);
    const result = decryptJson(key, envelope);
    expect(result).toEqual(data);
  });

  it("handles arrays", () => {
    const data = [1, "two", { three: 3 }];
    const envelope = encryptJson(key, data);
    expect(decryptJson(key, envelope)).toEqual(data);
  });

  it("handles null and primitive values", () => {
    expect(decryptJson(key, encryptJson(key, null))).toBeNull();
    expect(decryptJson(key, encryptJson(key, 42))).toBe(42);
    expect(decryptJson(key, encryptJson(key, "hello"))).toBe("hello");
  });
});
