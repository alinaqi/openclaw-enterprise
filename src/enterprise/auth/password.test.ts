import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD_POLICY,
  hashPassword,
  validatePassword,
  verifyPassword,
  wasRecentlyUsed,
} from "./password.js";

describe("password", () => {
  // ---------- hash & verify ----------

  describe("hashPassword / verifyPassword", () => {
    it("verifies a correct password", () => {
      const hash = hashPassword("MyStr0ng!Pass");
      expect(verifyPassword("MyStr0ng!Pass", hash)).toBe(true);
    });

    it("rejects a wrong password", () => {
      const hash = hashPassword("MyStr0ng!Pass");
      expect(verifyPassword("WrongPassword!", hash)).toBe(false);
    });

    it("produces different hashes for the same password (random salt)", () => {
      const a = hashPassword("Same1Pass!");
      const b = hashPassword("Same1Pass!");
      expect(a).not.toBe(b);
    });

    it("hash starts with $scrypt$ prefix", () => {
      const hash = hashPassword("Test1234!");
      expect(hash.startsWith("$scrypt$")).toBe(true);
    });

    it("returns false for malformed hash strings", () => {
      expect(verifyPassword("pass", "not-a-hash")).toBe(false);
      expect(verifyPassword("pass", "$scrypt$")).toBe(false);
      expect(verifyPassword("pass", "$scrypt$a$b")).toBe(false);
    });
  });

  // ---------- password policy validation ----------

  describe("validatePassword", () => {
    const strongPassword = "MyStr0ng!Password";

    it("accepts a strong password with default policy", () => {
      const result = validatePassword(strongPassword);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects a short password", () => {
      const result = validatePassword("Ab1!");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least"))).toBe(true);
    });

    it("rejects password without uppercase", () => {
      const result = validatePassword("mystrongpass1!");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
    });

    it("rejects password without lowercase", () => {
      const result = validatePassword("MYSTRONGPASS1!");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
    });

    it("rejects password without number", () => {
      const result = validatePassword("MyStrongPass!!");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("number"))).toBe(true);
    });

    it("rejects password without special character", () => {
      const result = validatePassword("MyStrongPass12");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("special"))).toBe(true);
    });

    it("accumulates multiple errors", () => {
      const result = validatePassword("ab");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("respects custom policy", () => {
      const result = validatePassword("short", {
        ...DEFAULT_PASSWORD_POLICY,
        minLength: 3,
        requireUppercase: false,
        requireNumber: false,
        requireSpecial: false,
      });
      expect(result.valid).toBe(true);
    });
  });

  // ---------- password reuse ----------

  describe("wasRecentlyUsed", () => {
    it("detects a recently used password", () => {
      const hash = hashPassword("OldP@ss123!!");
      expect(wasRecentlyUsed("OldP@ss123!!", [hash])).toBe(true);
    });

    it("does not flag an unused password", () => {
      const hash = hashPassword("OldP@ss123!!");
      expect(wasRecentlyUsed("NewP@ss456!!", [hash])).toBe(false);
    });

    it("respects the limit parameter", () => {
      const h1 = hashPassword("First1Pass!");
      const h2 = hashPassword("Secon2Pass!");
      const h3 = hashPassword("Third3Pass!");
      // With limit 2, only the last 2 hashes are checked
      expect(wasRecentlyUsed("First1Pass!", [h1, h2, h3], 2)).toBe(false);
      expect(wasRecentlyUsed("Third3Pass!", [h1, h2, h3], 2)).toBe(true);
    });
  });
});
