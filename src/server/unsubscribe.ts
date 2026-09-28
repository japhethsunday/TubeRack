import { createHmac } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { safeEqual } from "@/src/server/crypto";

/**
 * One-click unsubscribe (RFC 8058) for briefs, alerts and reminders.
 * The link carries the address plus an HMAC so nobody can unsubscribe others.
 */
function key(): string {
  const env = getServerEnv();
  return env.JWT_SECRET || env.ENCRYPTION_KEY || "";
}

export function unsubscribeToken(email: string): string {
  return createHmac("sha256", key()).update(`unsubscribe:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  return Boolean(key()) && safeEqual(unsubscribeToken(email), token);
}

export function unsubscribeUrl(email: string): string | null {
  if (!key()) return null;
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  const e = email.trim().toLowerCase();
  return `${app}/api/v1/email/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`;
}
