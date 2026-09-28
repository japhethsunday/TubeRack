import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";

/**
 * A generated video costs one flat price (credits for "autovideo"). Paying it
 * returns a short-lived signed pass; the voice-overs and images made for that
 * video carry the pass and are not charged again.
 */

const TTL_MS = 45 * 60 * 1000;
export const VIDEO_PASS_HEADER = "x-video-pass";

function key(): string {
  const k = getServerEnv().JWT_SECRET;
  if (!k) throw new Error("JWT_SECRET is not set");
  return k;
}
const sign = (data: string) => createHmac("sha256", key()).update(`video-pass:${data}`).digest("base64url");

export function issueVideoPass(workspaceId: string, id: string): string {
  const data = `${workspaceId}.${id}.${Date.now() + TTL_MS}`;
  return `${Buffer.from(data).toString("base64url")}.${sign(data)}`;
}

/** The pass id when the pass is genuine, unexpired and for this workspace; otherwise null. */
export function verifyVideoPass(token: string | null | undefined, workspaceId: string): string | null {
  if (!token || token.length > 400) return null;
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  let data: string;
  try {
    data = Buffer.from(b64, "base64url").toString();
  } catch {
    return null;
  }
  const want = Buffer.from(sign(data));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [ws, id, exp] = data.split(".");
  if (ws !== workspaceId || !id || !(Number(exp) > Date.now())) return null;
  return id;
}
