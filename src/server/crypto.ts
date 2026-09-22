import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, createHash } from "node:crypto";

/**
 * Password + token cryptography. scrypt for passwords (platform-consistent),
 * SHA-256 hashes for stored tokens (raw values never persisted).
 */

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err || !Buffer.isBuffer(derived)) reject(err ?? new Error("scrypt failed"));
      else resolve(derived);
    });
  });
}

/** Hash a password for storage. Format: scrypt$<salt-hex>$<hash-hex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  try {
    const derived = await scryptAsync(password, salt);
    const a = Buffer.from(derived.toString("hex"), "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 256-bit random token (URL-safe). The raw value goes to the cookie only. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex of a token for storage/lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time string comparison for non-secret adjacent checks. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
