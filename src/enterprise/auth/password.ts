/**
 * Password hashing and verification using scrypt.
 *
 * Uses Node.js built-in crypto with scrypt for password hashing.
 * No external dependencies required.
 *
 * Hash format: `$scrypt$N=16384,r=8,p=1$<salt-base64>$<hash-base64>`
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  maxAgeDays: number;
  preventReuse: number;
  lockoutAttempts: number;
  lockoutDurationMin: number;
};

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  maxAgeDays: 90,
  preventReuse: 5,
  lockoutAttempts: 5,
  lockoutDurationMin: 15,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALT_LENGTH = 32;
const HASH_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const HASH_PREFIX = "$scrypt$";

// ---------------------------------------------------------------------------
// Hash & Verify
// ---------------------------------------------------------------------------

/**
 * Hash a password using scrypt.
 * Returns a self-describing string with algorithm, parameters, salt, and hash.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, HASH_LENGTH, SCRYPT_PARAMS);
  const params = `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
  return `${HASH_PREFIX}${params}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Verify a password against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith(HASH_PREFIX)) {
    return false;
  }
  const parts = storedHash.slice(HASH_PREFIX.length).split("$");
  if (parts.length !== 3) {
    return false;
  }
  const [paramsStr, saltB64, hashB64] = parts;
  if (!paramsStr || !saltB64 || !hashB64) {
    return false;
  }

  // Parse scrypt params
  const paramMap = Object.fromEntries(paramsStr.split(",").map((p) => p.split("=")));
  const N = parseInt(paramMap["N"] ?? "0", 10);
  const r = parseInt(paramMap["r"] ?? "0", 10);
  const p = parseInt(paramMap["p"] ?? "0", 10);
  // Bound scrypt parameters to prevent DoS via crafted hashes
  if (!N || !r || !p || N > 1048576 || r > 16 || p > 16) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64");
  const expectedHash = Buffer.from(hashB64, "base64");
  // Validate expected hash length to prevent DoS
  if (expectedHash.length !== HASH_LENGTH) {
    return false;
  }
  const actualHash = scryptSync(password, salt, expectedHash.length, { N, r, p });

  return timingSafeEqual(actualHash, expectedHash);
}

// ---------------------------------------------------------------------------
// Password policy validation
// ---------------------------------------------------------------------------

/**
 * Validate a password against a policy.
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a password was recently used (against a list of previous hashes).
 */
export function wasRecentlyUsed(
  password: string,
  previousHashes: string[],
  limit: number = DEFAULT_PASSWORD_POLICY.preventReuse,
): boolean {
  if (limit <= 0) {
    return false;
  }
  const recent = previousHashes.slice(-limit);
  return recent.some((hash) => verifyPassword(password, hash));
}
