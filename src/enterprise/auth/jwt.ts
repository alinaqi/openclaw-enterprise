/**
 * JWT token creation and verification for enterprise auth.
 *
 * Uses HMAC-SHA256 for signing. Tokens contain tenant and role claims.
 * No external dependencies — uses Node.js built-in crypto.
 *
 * Token structure follows RFC 7519 with custom claims:
 *   - sub: userId
 *   - tid: tenantId
 *   - role: tenant role
 *   - scopes: permission scopes
 */

import { createHmac, randomUUID } from "node:crypto";
import type { JwtPayload, TenantId, TenantRole, UserId } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JwtConfig = {
  /** HMAC secret for signing (min 32 bytes recommended). */
  secret: string;
  /** Access token TTL in seconds. @default 900 (15 min) */
  accessTtlSeconds?: number;
  /** Refresh token TTL in seconds. @default 604800 (7 days) */
  refreshTtlSeconds?: number;
  /** Token issuer. @default 'openclaw-enterprise' */
  issuer?: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type JwtVerifyResult =
  | { valid: true; payload: JwtPayload }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ACCESS_TTL = 900; // 15 minutes
const DEFAULT_REFRESH_TTL = 604800; // 7 days
const _DEFAULT_ISSUER = "openclaw-enterprise";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  const padded = data + "=".repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function sign(payload: string, header: string, secret: string): string {
  const input = `${header}.${payload}`;
  return createHmac("sha256", secret).update(input).digest("base64url");
}

// ---------------------------------------------------------------------------
// Token creation
// ---------------------------------------------------------------------------

/**
 * Create a signed JWT access token.
 */
export function createAccessToken(
  config: JwtConfig,
  userId: UserId,
  tenantId: TenantId,
  role: TenantRole,
  scopes: string[] = [],
): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = config.accessTtlSeconds ?? DEFAULT_ACCESS_TTL;

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payload: JwtPayload = {
    sub: userId,
    tid: tenantId,
    role,
    scopes,
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded, header, config.secret);

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Create an access + refresh token pair.
 */
export function createTokenPair(
  config: JwtConfig,
  userId: UserId,
  tenantId: TenantId,
  role: TenantRole,
  scopes: string[] = [],
): TokenPair {
  const accessTtl = config.accessTtlSeconds ?? DEFAULT_ACCESS_TTL;
  const refreshTtl = config.refreshTtlSeconds ?? DEFAULT_REFRESH_TTL;

  const accessToken = createAccessToken(config, userId, tenantId, role, scopes);

  const now = Math.floor(Date.now() / 1000);
  const refreshHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const refreshPayload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      tid: tenantId,
      role,
      scopes: ["refresh"],
      iat: now,
      exp: now + refreshTtl,
      jti: randomUUID(),
    }),
  );
  const refreshSignature = sign(refreshPayload, refreshHeader, config.secret);
  const refreshToken = `${refreshHeader}.${refreshPayload}.${refreshSignature}`;

  return {
    accessToken,
    refreshToken,
    expiresAt: now + accessTtl,
  };
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

/**
 * Verify and decode a JWT token.
 *
 * Checks:
 * 1. Format (3 dot-separated parts)
 * 2. Signature (HMAC-SHA256)
 * 3. Expiry (exp claim)
 * 4. Required fields (sub, tid, role)
 */
export function verifyToken(config: JwtConfig, token: string): JwtVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid token format" };
  }

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    return { valid: false, error: "Invalid token format" };
  }

  // Verify signature
  const expectedSignature = sign(payload, header, config.secret);
  if (signature !== expectedSignature) {
    return { valid: false, error: "Invalid signature" };
  }

  // Decode payload
  let decoded: JwtPayload;
  try {
    decoded = JSON.parse(base64UrlDecode(payload)) as JwtPayload;
  } catch {
    return { valid: false, error: "Invalid payload encoding" };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp && decoded.exp < now) {
    return { valid: false, error: "Token expired" };
  }

  // Validate required fields
  if (!decoded.sub || !decoded.tid || !decoded.role) {
    return { valid: false, error: "Missing required claims (sub, tid, role)" };
  }

  return { valid: true, payload: decoded };
}

/**
 * Decode a JWT without verifying the signature.
 * Useful for reading claims from expired tokens during refresh flows.
 */
export function decodeTokenUnsafe(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}
