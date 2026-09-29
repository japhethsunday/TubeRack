import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Check a Resend (Svix) webhook signature: HMAC-SHA256 over "id.timestamp.body"
 * with the base64 part of the whsec_ secret, within 5 minutes of now.
 */
export function verifySvix(secret: string, id: string, timestamp: string, body: string, signatures: string, now = Date.now()): boolean {
  if (!secret || !id || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
