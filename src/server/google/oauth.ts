import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { open, seal } from "@/src/server/secret-box";
import { BackendError } from "@/src/server/errors";

/**
 * Google OAuth for a creator's own YouTube channel. Tokens are sealed at
 * rest; access tokens refresh automatically. Scopes: read channel data,
 * read YouTube Analytics, upload videos + set thumbnails.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  // Playlists + captions (publishing). Existing connections without it keep
  // working; publishing skips those steps and offers a one-click upgrade.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const FORCE_SSL_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export function hasScope(connection: { scopes: string } | null, scope: string): boolean {
  return Boolean(connection?.scopes.split(/\s+/).includes(scope));
}

export function isOAuthConfigured(env = getServerEnv()): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export class NotConnectedError extends BackendError {
  constructor(message = "Connect your YouTube channel first (YouTube page → Connect).") {
    super("VALIDATION_ERROR", message);
  }
}

export function redirectUri(origin: string): string {
  return `${origin}/api/v1/youtube/oauth/callback`;
}

export function authUrl(origin: string, state: string): string {
  const env = getServerEnv();
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenCall(params: Record<string, string>): Promise<TokenResponse> {
  const env = getServerEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID ?? "", client_secret: env.GOOGLE_CLIENT_SECRET ?? "", ...params }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(`Google sign-in failed: ${json.error_description || json.error || response.status}`);
  }
  return json;
}

export function exchangeCode(code: string, origin: string) {
  return tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
}

/** Google API call with a bearer token; errors carry Google's message. */
export async function googleApi<T = Record<string, unknown>>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const text = await response.text();
  const json = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } | string };
  if (!response.ok) {
    const err = json.error;
    const message = typeof err === "string" ? err : err?.message;
    throw new Error(`YouTube (your channel) request failed: ${message ?? response.status}`);
  }
  return json;
}

export interface Connection {
  workspaceId: string;
  userId: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  uploadsPlaylist: string;
  scopes: string;
  createdAt: string;
}

export async function getConnection(workspaceId: string): Promise<Connection | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`SELECT workspace_id, user_id, channel_id, channel_title, channel_thumbnail, uploads_playlist, scopes, created_at FROM youtube_connections WHERE workspace_id = ${workspaceId}`;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    workspaceId: String(r.workspace_id),
    userId: String(r.user_id),
    channelId: String(r.channel_id),
    channelTitle: String(r.channel_title),
    channelThumbnail: String(r.channel_thumbnail),
    uploadsPlaylist: String(r.uploads_playlist),
    scopes: String(r.scopes),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** Valid access token for the workspace's connected channel (refreshes when needed). */
export async function accessToken(workspaceId: string): Promise<string> {
  const db = getDb();
  if (!db) throw new NotConnectedError("Database unavailable.");
  const rows = await db`SELECT refresh_token_enc, access_token_enc, access_expires_at FROM youtube_connections WHERE workspace_id = ${workspaceId}`;
  const r = rows[0] as { refresh_token_enc: string; access_token_enc: string | null; access_expires_at: string | null } | undefined;
  if (!r) throw new NotConnectedError();
  if (r.access_token_enc && r.access_expires_at && new Date(r.access_expires_at).getTime() > Date.now() + 60_000) {
    return open(r.access_token_enc);
  }
  let refreshed: TokenResponse;
  try {
    refreshed = await tokenCall({ refresh_token: open(r.refresh_token_enc), grant_type: "refresh_token" });
  } catch (error) {
    if (/invalid_grant/i.test(String(error))) {
      throw new NotConnectedError("Your YouTube connection expired or was revoked. Reconnect it on the YouTube page.");
    }
    throw error;
  }
  const expires = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  await db`UPDATE youtube_connections SET access_token_enc = ${seal(refreshed.access_token!)}, access_expires_at = ${expires}, updated_at = now() WHERE workspace_id = ${workspaceId}`;
  return refreshed.access_token!;
}

export async function saveConnection(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
}): Promise<Connection> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const token = input.tokens.access_token!;
  const me = await googleApi<{ items?: { id: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true",
    token,
  );
  const ch = me.items?.[0];
  if (!ch) throw new Error("That Google account has no YouTube channel. Create one on YouTube, then connect again.");
  let refreshEnc: string | null = input.tokens.refresh_token ? seal(input.tokens.refresh_token) : null;
  if (!refreshEnc) {
    const existing = await db`SELECT refresh_token_enc FROM youtube_connections WHERE workspace_id = ${input.workspaceId}`;
    refreshEnc = (existing[0] as { refresh_token_enc?: string } | undefined)?.refresh_token_enc ?? null;
  }
  if (!refreshEnc) throw new Error("Google did not return offline access. Remove TubeRack from your Google account permissions and connect again.");
  const thumb = ch.snippet?.thumbnails?.default?.url ?? "";
  const expires = new Date(Date.now() + (input.tokens.expires_in ?? 3600) * 1000).toISOString();
  await db`
    INSERT INTO youtube_connections (workspace_id, user_id, channel_id, channel_title, channel_thumbnail, uploads_playlist, refresh_token_enc, access_token_enc, access_expires_at, scopes)
    VALUES (${input.workspaceId}, ${input.userId}, ${ch.id}, ${ch.snippet?.title ?? ""}, ${thumb}, ${ch.contentDetails?.relatedPlaylists?.uploads ?? ""}, ${refreshEnc}, ${seal(token)}, ${expires}, ${input.tokens.scope ?? ""})
    ON CONFLICT (workspace_id) DO UPDATE SET user_id = EXCLUDED.user_id, channel_id = EXCLUDED.channel_id, channel_title = EXCLUDED.channel_title,
      channel_thumbnail = EXCLUDED.channel_thumbnail, uploads_playlist = EXCLUDED.uploads_playlist, refresh_token_enc = EXCLUDED.refresh_token_enc,
      access_token_enc = EXCLUDED.access_token_enc, access_expires_at = EXCLUDED.access_expires_at, scopes = EXCLUDED.scopes, updated_at = now()
  `;
  return (await getConnection(input.workspaceId))!;
}

export async function deleteConnection(workspaceId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const rows = await db`SELECT refresh_token_enc FROM youtube_connections WHERE workspace_id = ${workspaceId}`;
  const r = rows[0] as { refresh_token_enc?: string } | undefined;
  if (r?.refresh_token_enc) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(open(r.refresh_token_enc))}`, { method: "POST", signal: AbortSignal.timeout(8000) });
    } catch {
      // revocation is best-effort; the row is deleted either way
    }
  }
  await db`DELETE FROM youtube_connections WHERE workspace_id = ${workspaceId}`;
}

/**
 * True when another TubeRack account has connected the same YouTube channel
 * (the owner's work is then split across two logins). Reveals no identity.
 */
export async function channelOnOtherAccount(channelId: string, userId: string): Promise<boolean> {
  const db = getDb();
  if (!db || !channelId) return false;
  const rows = await db`
    SELECT 1 FROM youtube_connections c
    JOIN memberships m ON m.workspace_id = c.workspace_id
    WHERE c.channel_id = ${channelId} AND m.user_id <> ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}
