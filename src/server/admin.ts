import { getDb } from "@/src/server/db";
import { getSessionUser, type SessionUser } from "@/src/server/auth";
import { getServerEnv } from "@/src/lib/env";
import { audit } from "@/src/server/audit";
import { backendUnavailable, notFound, rateLimited } from "@/src/server/errors";
import { limiterFor, callerKey } from "@/src/server/rate-limit";

/**
 * Admin access. Only listed emails (ADMIN_EMAILS, default the owner) with a
 * verified address and an active account get in. Everyone else — signed out
 * or not — sees a plain 404, so the admin area doesn't reveal it exists.
 */

const OWNER = "japhethsunday5@gmail.com";

export function adminEmails(env = getServerEnv()): string[] {
  return (env.ADMIN_EMAILS || OWNER)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: Pick<SessionUser, "email" | "emailVerifiedAt" | "status"> | null): boolean {
  return Boolean(user && user.status === "active" && user.emailVerifiedAt && adminEmails().includes(user.email.trim().toLowerCase()));
}

/** Guard every admin API: rate-limited, 404 for non-admins, every call audited. */
export async function requireAdmin(request: Request, action: string): Promise<SessionUser> {
  const limit = limiterFor("write").take(`admin:${callerKey(request)}`);
  if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
  const user = await getSessionUser();
  if (!isAdmin(user)) {
    if (user) await audit({ userId: user.id, action: "admin.denied", metadata: { path: new URL(request.url).pathname } });
    throw notFound("Page");
  }
  await audit({ userId: user!.id, action: `admin.${action}` });
  return user!;
}

export function adminDb() {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  return db;
}

const n = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : null);

export async function adminOverview() {
  const db = adminDb();
  const [users] = await db`
    SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS total,
           count(*) FILTER (WHERE deleted_at IS NULL AND created_at > now() - interval '1 day') AS d1,
           count(*) FILTER (WHERE deleted_at IS NULL AND created_at > now() - interval '7 days') AS d7,
           count(*) FILTER (WHERE deleted_at IS NULL AND created_at > now() - interval '30 days') AS d30,
           count(*) FILTER (WHERE status = 'suspended') AS suspended,
           count(*) FILTER (WHERE deleted_at IS NULL AND email_verified_at IS NULL) AS unverified
    FROM users`;
  const [active] = await db`
    SELECT count(DISTINCT user_id) FILTER (WHERE last_used_at > now() - interval '1 day') AS d1,
           count(DISTINCT user_id) FILTER (WHERE last_used_at > now() - interval '7 days') AS d7
    FROM auth_sessions WHERE revoked_at IS NULL`;
  const [content] = await db`
    SELECT (SELECT count(*) FROM workspaces) AS workspaces,
           (SELECT count(*) FROM projects WHERE deleted_at IS NULL) AS projects,
           (SELECT count(*) FROM media_assets) AS assets,
           (SELECT coalesce(sum(file_size), 0) FROM media_assets) AS bytes,
           (SELECT count(*) FROM youtube_connections) AS youtube,
           (SELECT count(*) FROM youtube_publishes) AS publishes,
           (SELECT count(*) FROM trend_watches) AS watches,
           (SELECT count(*) FROM competitors) AS competitors`;
  const usage = await db`
    SELECT kind, count(*) FILTER (WHERE status = 'completed') AS ok, count(*) FILTER (WHERE status = 'failed') AS failed
    FROM usage_events WHERE created_at > now() - interval '7 days' GROUP BY kind ORDER BY count(*) DESC`;
  const daily = await db`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
           (SELECT count(*) FROM users u WHERE u.created_at::date = d::date) AS signups,
           (SELECT count(*) FROM usage_events e WHERE e.created_at::date = d::date) AS generations
    FROM generate_series(now() - interval '13 days', now(), interval '1 day') d ORDER BY d`;
  const env = getServerEnv() as Record<string, unknown>;
  const has = (k: string) => Boolean(env[k]);
  return {
    users: { total: n(users.total), d1: n(users.d1), d7: n(users.d7), d30: n(users.d30), suspended: n(users.suspended), unverified: n(users.unverified) },
    active: { d1: n(active.d1), d7: n(active.d7) },
    content: {
      workspaces: n(content.workspaces), projects: n(content.projects), assets: n(content.assets), storageBytes: n(content.bytes),
      youtubeConnections: n(content.youtube), publishes: n(content.publishes), trendWatches: n(content.watches), competitors: n(content.competitors),
    },
    usage: usage.map((u) => ({ kind: String(u.kind), ok: n(u.ok), failed: n(u.failed) })),
    daily: daily.map((d) => ({ day: String(d.day), signups: n(d.signups), generations: n(d.generations) })),
    services: [
      { name: "Database", ok: true },
      { name: "File storage", ok: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY") },
      { name: "Email (Resend)", ok: has("RESEND_API_KEY") },
      { name: "Google sign-in / YouTube", ok: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET") },
      { name: "YouTube Data API", ok: has("YOUTUBE_API_KEY") },
      { name: "Text & images (Gemini)", ok: has("GEMINI_API_KEY") },
      { name: "Stock footage (Pixabay)", ok: has("PIXABAY_API_KEY") },
      { name: "Music library (Jamendo)", ok: has("JAMENDO_CLIENT_ID") },
      { name: "Daily automation (cron)", ok: has("CRON_SECRET") },
    ],
  };
}

export async function adminUsers(q: string, page: number) {
  const db = adminDb();
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const limit = 25;
  const offset = Math.max(0, page - 1) * limit;
  const rows = await db`
    SELECT u.id, u.email, u.name, u.status, u.email_verified_at, u.created_at,
           (SELECT max(last_used_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen,
           (SELECT count(*) FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id) AS projects,
           (SELECT count(*) FROM usage_events e WHERE e.user_id = u.id AND e.created_at > now() - interval '30 days') AS usage30,
           EXISTS (SELECT 1 FROM youtube_connections y JOIN memberships m ON m.workspace_id = y.workspace_id WHERE m.user_id = u.id) AS youtube,
           count(*) OVER () AS total
    FROM users u
    WHERE u.deleted_at IS NULL AND (${q} = '' OR u.email ILIKE ${like} OR u.name ILIKE ${like})
    ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  return {
    total: n(rows[0]?.total),
    page,
    pageSize: limit,
    users: rows.map((r) => ({
      id: String(r.id), email: String(r.email), name: String(r.name), status: String(r.status),
      verified: Boolean(r.email_verified_at), createdAt: iso(r.created_at)!, lastSeen: iso(r.last_seen),
      projects: n(r.projects), usage30: n(r.usage30), youtube: Boolean(r.youtube),
    })),
  };
}

export async function adminAudit(page: number, action: string) {
  const db = adminDb();
  const limit = 40;
  const rows = await db`
    SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at, u.email
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE (${action} = '' OR a.action LIKE ${`${action}%`})
    ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${Math.max(0, page - 1) * limit}`;
  return rows.map((r) => ({
    id: String(r.id), action: String(r.action), resource: r.resource_type ? `${String(r.resource_type)}${r.resource_id ? ` ${String(r.resource_id).slice(0, 12)}` : ""}` : "",
    email: r.email ? String(r.email) : "", createdAt: iso(r.created_at)!, metadata: r.metadata as Record<string, unknown>,
  }));
}
