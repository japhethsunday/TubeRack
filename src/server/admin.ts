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
           (SELECT c.balance FROM memberships m JOIN credit_accounts c ON c.workspace_id = m.workspace_id WHERE m.user_id = u.id AND m.role = 'owner' ORDER BY m.id LIMIT 1) AS credits,
           (SELECT c.unlimited FROM memberships m JOIN credit_accounts c ON c.workspace_id = m.workspace_id WHERE m.user_id = u.id AND m.role = 'owner' ORDER BY m.id LIMIT 1) AS unlimited,
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
      credits: r.credits === null || r.credits === undefined ? null : n(r.credits), unlimited: Boolean(r.unlimited),
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

/** Everything about one account, for the user drawer. */
export async function adminUserDetail(id: string) {
  const db = adminDb();
  const [u] = await db`SELECT id, email, name, status, email_verified_at, created_at FROM users WHERE id = ${id} AND deleted_at IS NULL`;
  if (!u) return null;
  const workspaces = await db`
    SELECT w.id, w.name, m.role, c.balance, c.monthly_grant, c.unlimited, c.refilled_at,
           (SELECT count(*) FROM projects p WHERE p.workspace_id = w.id AND p.deleted_at IS NULL) AS projects,
           (SELECT count(*) FROM media_assets a WHERE a.workspace_id = w.id) AS assets,
           (SELECT channel_title FROM youtube_connections y WHERE y.workspace_id = w.id) AS youtube
    FROM memberships m JOIN workspaces w ON w.id = m.workspace_id LEFT JOIN credit_accounts c ON c.workspace_id = w.id
    WHERE m.user_id = ${id} ORDER BY (m.role = 'owner') DESC, w.created_at`;
  const sessions = await db`
    SELECT created_at, last_used_at, user_agent FROM auth_sessions
    WHERE user_id = ${id} AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC LIMIT 10`;
  const usage = await db`
    SELECT kind, status, provider, created_at FROM usage_events WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 25`;
  const ledger = await db`
    SELECT t.kind, t.amount, t.balance_after, t.ref, t.created_at FROM credit_transactions t
    JOIN credit_accounts c ON c.id = t.account_id JOIN memberships m ON m.workspace_id = c.workspace_id AND m.user_id = ${id}
    ORDER BY t.created_at DESC LIMIT 25`;
  const projects = await db`
    SELECT p.id, p.name, p.status, p.updated_at FROM projects p JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = ${id}
    WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 15`;
  return {
    user: { id: String(u.id), email: String(u.email), name: String(u.name), status: String(u.status), verified: Boolean(u.email_verified_at), createdAt: iso(u.created_at)!, admin: isAdmin({ email: String(u.email), emailVerifiedAt: u.email_verified_at ? "y" : null, status: String(u.status) }) },
    workspaces: workspaces.map((w) => ({ id: String(w.id), name: String(w.name), role: String(w.role), balance: n(w.balance), monthlyGrant: n(w.monthly_grant), unlimited: Boolean(w.unlimited), refilledAt: iso(w.refilled_at), projects: n(w.projects), assets: n(w.assets), youtube: w.youtube ? String(w.youtube) : null })),
    sessions: sessions.map((x) => ({ createdAt: iso(x.created_at)!, lastUsedAt: iso(x.last_used_at)!, device: String(x.user_agent ?? "").slice(0, 120) })),
    usage: usage.map((x) => ({ kind: String(x.kind), status: String(x.status), provider: String(x.provider ?? ""), createdAt: iso(x.created_at)! })),
    ledger: ledger.map((x) => ({ kind: String(x.kind), amount: n(x.amount), balanceAfter: n(x.balance_after), ref: x.ref ? String(x.ref) : "", createdAt: iso(x.created_at)! })),
    projects: projects.map((x) => ({ id: String(x.id), name: String(x.name), status: String(x.status), updatedAt: iso(x.updated_at)! })),
  };
}

/** Credit accounts across the app, lowest balance first (who needs a top-up). */
export async function adminCredits(q: string) {
  const db = adminDb();
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db`
    SELECT c.workspace_id, w.name AS workspace, u.email, c.balance, c.monthly_grant, c.unlimited, c.refilled_at,
           (SELECT coalesce(sum(-t.amount), 0) FROM credit_transactions t WHERE t.account_id = c.id AND t.amount < 0 AND t.created_at > now() - interval '30 days') AS spent30
    FROM credit_accounts c JOIN workspaces w ON w.id = c.workspace_id LEFT JOIN users u ON u.id = w.owner_id
    WHERE ${q} = '' OR u.email ILIKE ${like} OR w.name ILIKE ${like}
    ORDER BY c.unlimited, c.balance ASC LIMIT 100`;
  const [totals] = await db`SELECT coalesce(sum(balance), 0) AS balance, count(*) FILTER (WHERE balance = 0 AND NOT unlimited) AS empty, count(*) FILTER (WHERE unlimited) AS unlimited FROM credit_accounts`;
  return {
    totals: { balance: n(totals.balance), empty: n(totals.empty), unlimited: n(totals.unlimited) },
    accounts: rows.map((r) => ({ workspaceId: String(r.workspace_id), workspace: String(r.workspace), email: r.email ? String(r.email) : "", balance: n(r.balance), monthlyGrant: n(r.monthly_grant), unlimited: Boolean(r.unlimited), refilledAt: iso(r.refilled_at), spent30: n(r.spent30) })),
  };
}

/** Live feed of generations across the app. */
export async function adminUsageFeed(status: string) {
  const db = adminDb();
  const rows = await db`
    SELECT e.kind, e.status, e.provider, e.model, e.created_at, u.email
    FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE (${status} = '' OR e.status = ${status})
    ORDER BY e.created_at DESC LIMIT 100`;
  return rows.map((r) => ({ kind: String(r.kind), status: String(r.status), provider: String(r.provider ?? ""), model: String(r.model ?? ""), email: r.email ? String(r.email) : "", createdAt: iso(r.created_at)! }));
}

/** Recent projects across all workspaces. */
export async function adminProjects(q: string) {
  const db = adminDb();
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db`
    SELECT p.id, p.name, p.status, p.updated_at, p.created_at, u.email,
           (SELECT count(*) FROM media_assets a WHERE a.project_id = p.id) AS assets
    FROM projects p JOIN workspaces w ON w.id = p.workspace_id LEFT JOIN users u ON u.id = w.owner_id
    WHERE p.deleted_at IS NULL AND (${q} = '' OR p.name ILIKE ${like} OR u.email ILIKE ${like})
    ORDER BY p.updated_at DESC LIMIT 100`;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), status: String(r.status), email: r.email ? String(r.email) : "", assets: n(r.assets), updatedAt: iso(r.updated_at)!, createdAt: iso(r.created_at)! }));
}

/** Post an in-app announcement to every active user. */
export async function adminBroadcast(title: string, body: string): Promise<number> {
  const db = adminDb();
  const rows = await db`
    INSERT INTO notifications (user_id, type, title, body)
    SELECT id, 'announcement', ${title}, ${body} FROM users WHERE deleted_at IS NULL AND status = 'active'
    RETURNING id`;
  return rows.length;
}
