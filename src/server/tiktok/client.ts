import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { open, seal } from "@/src/server/secret-box";
import { BackendError } from "@/src/server/errors";

/**
 * TikTok Login Kit + Content Posting API. Tokens are sealed at rest and
 * refreshed automatically. Scopes: basic profile, upload drafts, direct post.
 */
export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];
const API = "https://open.tiktokapis.com/v2";

export function isTikTokConfigured(env = getServerEnv()): boolean {
  return Boolean(env.TIKTOK_CLIENT_KEY?.trim() && env.TIKTOK_CLIENT_SECRET?.trim());
}

export class TikTokNotConnectedError extends BackendError {
  constructor(message = "Connect your TikTok account first.") {
    super("VALIDATION_ERROR", message);
  }
}

/** The one redirect address registered with TikTok (always the www host). */
export function tiktokRedirectUri(origin: string): string {
  try {
    return new URL(origin).hostname.endsWith("recktube.xyz") ? "https://www.recktube.xyz/api/v1/tiktok/callback" : `${origin}/api/v1/tiktok/callback`;
  } catch {
    return `${origin}/api/v1/tiktok/callback`;
  }
}

export function tiktokAuthUrl(origin: string, state: string): string {
  const q = new URLSearchParams({
    client_key: (getServerEnv().TIKTOK_CLIENT_KEY ?? "").trim(),
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: tiktokRedirectUri(origin),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenCall(params: Record<string, string>): Promise<TokenResponse> {
  const env = getServerEnv();
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: (env.TIKTOK_CLIENT_KEY ?? "").trim(), client_secret: (env.TIKTOK_CLIENT_SECRET ?? "").trim(), ...params }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(`TikTok sign-in failed: ${json.error_description || json.error || res.status}`);
  return json;
}

export function exchangeTikTokCode(code: string, origin: string) {
  return tokenCall({ code, grant_type: "authorization_code", redirect_uri: tiktokRedirectUri(origin) });
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

/** Plain-words message for TikTok's error codes. */
function tiktokMessage(code: string, message: string): string {
  const map: Record<string, string> = {
    access_token_invalid: "Your TikTok connection expired. Reconnect TikTok.",
    scope_not_authorized: "TikTok didn't allow posting for this account. Reconnect TikTok and allow all permissions.",
    spam_risk_too_many_posts: "TikTok's daily post limit for this account is reached. Try again tomorrow.",
    spam_risk_user_banned_from_posting: "TikTok isn't letting this account post right now.",
    rate_limit_exceeded: "TikTok is busy. Try again in a minute.",
    unaudited_client_can_only_post_to_private_accounts: "Until Recktube's TikTok app is approved, posts must be 'Only me' and the TikTok account must be private.",
    privacy_level_option_mismatch: "That privacy choice isn't available for this account. Pick another.",
    url_ownership_unverified: "TikTok couldn't verify the video address.",
    file_format_check_failed: "TikTok couldn't read the video file. Export it again and retry.",
    duration_check_failed: "The video is longer than this TikTok account allows.",
    frame_rate_check_failed: "TikTok didn't accept the video's frame rate.",
    picture_size_check_failed: "TikTok didn't accept the video's size (it needs at least 360px on each side).",
  };
  return map[code] ?? `TikTok: ${message || code}`;
}

export async function tiktokApi<T>(path: string, token: string, body?: unknown, method: "GET" | "POST" = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json; charset=UTF-8" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  const code = json.error?.code ?? "";
  if (!res.ok || (code && code !== "ok")) {
    if (res.status === 401 || code === "access_token_invalid") throw new TikTokNotConnectedError(tiktokMessage("access_token_invalid", ""));
    if (res.status === 429) throw new BackendError("RATE_LIMITED", tiktokMessage("rate_limit_exceeded", ""));
    throw new BackendError("VALIDATION_ERROR", tiktokMessage(code, json.error?.message ?? `status ${res.status}`));
  }
  return (json.data ?? {}) as T;
}

export interface TikTokConnection {
  openId: string;
  displayName: string;
  avatarUrl: string;
  scopes: string;
  createdAt: string;
}

export async function getTikTokConnection(workspaceId: string): Promise<TikTokConnection | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db`SELECT open_id, display_name, avatar_url, scopes, created_at FROM tiktok_connections WHERE workspace_id = ${workspaceId}`;
  if (!r) return null;
  return { openId: String(r.open_id), displayName: String(r.display_name), avatarUrl: String(r.avatar_url), scopes: String(r.scopes), createdAt: new Date(r.created_at as string).toISOString() };
}

/** A valid access token for the workspace's TikTok account (refreshes when needed). */
export async function tiktokAccessToken(workspaceId: string): Promise<string> {
  const db = getDb();
  if (!db) throw new TikTokNotConnectedError("Database unavailable.");
  const [r] = await db`SELECT refresh_token_enc, access_token_enc, access_expires_at FROM tiktok_connections WHERE workspace_id = ${workspaceId}`;
  if (!r) throw new TikTokNotConnectedError();
  if (r.access_token_enc && r.access_expires_at && new Date(r.access_expires_at as string).getTime() > Date.now() + 120_000) return open(String(r.access_token_enc));
  let t: TokenResponse;
  try {
    t = await tokenCall({ grant_type: "refresh_token", refresh_token: open(String(r.refresh_token_enc)) });
  } catch {
    throw new TikTokNotConnectedError("Your TikTok connection expired. Reconnect TikTok.");
  }
  const expires = new Date(Date.now() + (t.expires_in ?? 86_400) * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + (t.refresh_expires_in ?? 31_536_000) * 1000).toISOString();
  await db`UPDATE tiktok_connections SET access_token_enc = ${seal(t.access_token!)}, access_expires_at = ${expires},
    refresh_token_enc = ${t.refresh_token ? seal(t.refresh_token) : r.refresh_token_enc}, refresh_expires_at = ${refreshExpires}, updated_at = now()
    WHERE workspace_id = ${workspaceId}`;
  return t.access_token!;
}

export async function saveTikTokConnection(input: { workspaceId: string; userId: string; tokens: TokenResponse }): Promise<TikTokConnection> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const t = input.tokens;
  if (!t.refresh_token) throw new Error("TikTok didn't return lasting access. Please connect again.");
  const me = await tiktokApi<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>("/user/info/?fields=open_id,display_name,avatar_url", t.access_token!);
  const expires = new Date(Date.now() + (t.expires_in ?? 86_400) * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + (t.refresh_expires_in ?? 31_536_000) * 1000).toISOString();
  await db`
    INSERT INTO tiktok_connections (workspace_id, user_id, open_id, display_name, avatar_url, refresh_token_enc, access_token_enc, access_expires_at, refresh_expires_at, scopes)
    VALUES (${input.workspaceId}, ${input.userId}, ${me.user?.open_id ?? t.open_id ?? ""}, ${me.user?.display_name ?? ""}, ${me.user?.avatar_url ?? ""},
      ${seal(t.refresh_token)}, ${seal(t.access_token!)}, ${expires}, ${refreshExpires}, ${t.scope ?? ""})
    ON CONFLICT (workspace_id) DO UPDATE SET user_id = EXCLUDED.user_id, open_id = EXCLUDED.open_id, display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url, refresh_token_enc = EXCLUDED.refresh_token_enc, access_token_enc = EXCLUDED.access_token_enc,
      access_expires_at = EXCLUDED.access_expires_at, refresh_expires_at = EXCLUDED.refresh_expires_at, scopes = EXCLUDED.scopes, updated_at = now()`;
  return (await getTikTokConnection(input.workspaceId))!;
}

export async function deleteTikTokConnection(workspaceId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [r] = await db`SELECT access_token_enc FROM tiktok_connections WHERE workspace_id = ${workspaceId}`;
  if (r?.access_token_enc) {
    const env = getServerEnv();
    try {
      await fetch(`${API}/oauth/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY ?? "", client_secret: env.TIKTOK_CLIENT_SECRET ?? "", token: open(String(r.access_token_enc)) }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // revocation is best-effort; the row is deleted either way
    }
  }
  await db`DELETE FROM tiktok_connections WHERE workspace_id = ${workspaceId}`;
}

export interface CreatorInfo {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** What this creator may post right now (TikTok requires showing this before posting). */
export async function creatorInfo(workspaceId: string): Promise<CreatorInfo> {
  return tiktokApi<CreatorInfo>("/post/publish/creator_info/query/", await tiktokAccessToken(workspaceId), {});
}

/** TikTok's chunk rules: 5–64 MB chunks, the last may be up to 128 MB; under 5 MB goes whole. */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 32 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

/** Upload the bytes to TikTok's upload URL in the planned chunks. */
export async function uploadChunks(uploadUrl: string, bytes: Uint8Array, mime: string): Promise<void> {
  const { chunkSize, count } = chunkPlan(bytes.byteLength);
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? bytes.byteLength : start + chunkSize;
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime, "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${bytes.byteLength}` },
      body: Buffer.from(bytes.subarray(start, end)),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok && res.status !== 206) throw new BackendError("BACKEND_UNAVAILABLE", `TikTok upload failed (${res.status}). Try again.`);
  }
}
