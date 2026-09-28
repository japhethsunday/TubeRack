import { createHmac } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { safeEqual } from "@/src/server/crypto";

/**
 * One-click unsubscribe (RFC 8058) and signed tracking links.
 * - scope "briefs": trend briefs, alerts and reminders (original links, no k param)
 * - scope "marketing": product news / campaigns (k=m)
 * Every link carries an HMAC so nobody can unsubscribe others or forge redirects.
 */
export type UnsubscribeScope = "briefs" | "marketing";

function key(): string {
  const env = getServerEnv();
  return env.JWT_SECRET || env.ENCRYPTION_KEY || "";
}

function mac(data: string, n = 32): string {
  return createHmac("sha256", key()).update(data).digest("base64url").slice(0, n);
}

export function unsubscribeToken(email: string, scope: UnsubscribeScope = "briefs"): string {
  const e = email.trim().toLowerCase();
  return mac(scope === "briefs" ? `unsubscribe:${e}` : `unsubscribe:${scope}:${e}`);
}

export function verifyUnsubscribe(email: string, token: string, scope: UnsubscribeScope = "briefs"): boolean {
  return Boolean(key()) && safeEqual(unsubscribeToken(email, scope), token);
}

export function unsubscribeUrl(email: string, scope: UnsubscribeScope = "briefs", sendId?: string): string | null {
  if (!key()) return null;
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  const e = email.trim().toLowerCase();
  const extra = scope === "marketing" ? `&k=m${sendId ? `&s=${encodeURIComponent(sendId)}` : ""}` : "";
  return `${app}/api/v1/email/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubscribeToken(e, scope)}${extra}`;
}

/** Signed click-tracking redirect for a campaign send (no open redirect: the target is signed). */
export function trackedUrl(sendId: string, target: string): string {
  if (!key()) return target;
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  return `${app}/api/v1/email/c/${encodeURIComponent(sendId)}?u=${encodeURIComponent(target)}&t=${mac(`click:${sendId}:${target}`, 22)}`;
}

export function verifyTracked(sendId: string, target: string, token: string): boolean {
  return Boolean(key()) && safeEqual(mac(`click:${sendId}:${target}`, 22), token);
}

export function openPixelUrl(sendId: string): string {
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  return `${app}/api/v1/email/o/${encodeURIComponent(sendId)}`;
}
