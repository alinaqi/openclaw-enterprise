import { describe, expect, it, vi } from "vitest";
import {
  createAccessToken,
  createTokenPair,
  decodeTokenUnsafe,
  verifyToken,
  type JwtConfig,
} from "./jwt.js";

describe("jwt", () => {
  const config: JwtConfig = {
    secret: "test-secret-that-is-at-least-32-bytes-long!!",
    accessTtlSeconds: 900,
    refreshTtlSeconds: 604800,
    issuer: "test-issuer",
  };

  const userId = "user-123";
  const tenantId = "tenant-456";
  const role = "admin" as const;

  // ---------- createAccessToken ----------

  describe("createAccessToken", () => {
    it("creates a 3-part dot-separated token", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const parts = token.split(".");
      expect(parts.length).toBe(3);
    });

    it("includes correct claims when decoded", () => {
      const token = createAccessToken(config, userId, tenantId, role, ["read"]);
      const payload = decodeTokenUnsafe(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(userId);
      expect(payload!.tid).toBe(tenantId);
      expect(payload!.role).toBe(role);
      expect(payload!.scopes).toEqual(["read"]);
      expect(typeof payload!.iat).toBe("number");
      expect(typeof payload!.exp).toBe("number");
      expect(typeof payload!.jti).toBe("string");
    });

    it("sets correct expiry based on config", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const payload = decodeTokenUnsafe(token);
      expect(payload!.exp - payload!.iat).toBe(900);
    });

    it("defaults scopes to empty array", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const payload = decodeTokenUnsafe(token);
      expect(payload!.scopes).toEqual([]);
    });
  });

  // ---------- createTokenPair ----------

  describe("createTokenPair", () => {
    it("returns both access and refresh tokens", () => {
      const pair = createTokenPair(config, userId, tenantId, role);
      expect(typeof pair.accessToken).toBe("string");
      expect(typeof pair.refreshToken).toBe("string");
      expect(typeof pair.expiresAt).toBe("number");
      expect(pair.accessToken).not.toBe(pair.refreshToken);
    });

    it("refresh token has refresh scope", () => {
      const pair = createTokenPair(config, userId, tenantId, role);
      const payload = decodeTokenUnsafe(pair.refreshToken);
      expect(payload!.scopes).toEqual(["refresh"]);
    });

    it("access token is verifiable", () => {
      const pair = createTokenPair(config, userId, tenantId, role);
      const result = verifyToken(config, pair.accessToken);
      expect(result.valid).toBe(true);
    });
  });

  // ---------- verifyToken ----------

  describe("verifyToken", () => {
    it("verifies a valid token", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const result = verifyToken(config, token);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.sub).toBe(userId);
        expect(result.payload.tid).toBe(tenantId);
        expect(result.payload.role).toBe(role);
      }
    });

    it("rejects a token with wrong secret", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const wrongConfig: JwtConfig = { ...config, secret: "wrong-secret-that-is-long-enough!!" };
      const result = verifyToken(wrongConfig, token);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Invalid signature");
      }
    });

    it("rejects a malformed token", () => {
      expect(verifyToken(config, "not-a-token").valid).toBe(false);
      expect(verifyToken(config, "a.b").valid).toBe(false);
      expect(verifyToken(config, "...").valid).toBe(false);
    });

    it("rejects an expired token", () => {
      vi.useFakeTimers();
      try {
        const shortConfig: JwtConfig = { ...config, accessTtlSeconds: 1 };
        const token = createAccessToken(shortConfig, userId, tenantId, role);

        // Advance past expiry
        vi.advanceTimersByTime(2000);
        const result = verifyToken(shortConfig, token);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe("Token expired");
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects a token with tampered payload", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const parts = token.split(".");
      // Tamper with the payload
      parts[1] = parts[1].slice(0, -2) + "XX";
      const tampered = parts.join(".");
      const result = verifyToken(config, tampered);
      expect(result.valid).toBe(false);
    });
  });

  // ---------- decodeTokenUnsafe ----------

  describe("decodeTokenUnsafe", () => {
    it("decodes a valid token without verification", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const payload = decodeTokenUnsafe(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(userId);
    });

    it("returns null for invalid format", () => {
      expect(decodeTokenUnsafe("not-a-jwt")).toBeNull();
      expect(decodeTokenUnsafe("a.b")).toBeNull();
    });

    it("decodes even with wrong signature", () => {
      const token = createAccessToken(config, userId, tenantId, role);
      const parts = token.split(".");
      parts[2] = "invalid-signature";
      const tampered = parts.join(".");
      const payload = decodeTokenUnsafe(tampered);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(userId);
    });
  });
});
