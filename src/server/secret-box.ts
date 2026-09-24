import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";

/**
 * AES-256-GCM for secrets at rest (OAuth refresh tokens). The key derives
 * from ENCRYPTION_KEY, falling back to other server-only secrets so the
 * feature works without extra setup. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
function key(): Buffer {
  const env = getServerEnv();
  const material = env.ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || env.DATABASE_URL;
  if (!material) throw new Error("No server secret available to encrypt tokens (set ENCRYPTION_KEY).");
  return createHash("sha256").update(`tuberack:secret-box:${material}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
