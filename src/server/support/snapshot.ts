import { getDb } from "@/src/server/db";
import { creditState } from "@/src/server/credits";

/**
 * Read-only snapshot of ONE signed-in user's own account for the support
 * assistant. Every query is scoped to that user id / their workspace — the
 * assistant never sees anyone else's data and has no way to ask for it.
 * Free text that users wrote (project names, errors) is clipped; the prompt
 * treats the whole snapshot as data, never as instructions.
 */
export interface AccountSnapshot {
  account: { name: string; email: string; emailVerified: boolean; status: string; joined: string; activeSessions: number };
  credits: { balance: number | "unlimited"; monthlyAllowance: number; lastRefill: string | null; nextRefill: string | null } | null;
  creditHistory: { when: string; change: number; balanceAfter: number; reason: string }[];
  recentGenerations: { when: string; kind: string; status: string }[];
  failedGenerationsLast7Days: number;
  recentJobs: { when: string; type: string; status: string; error: string | null }[];
  projects: { name: string; status: string; stage: string; updated: string }[];
  projectCount: number;
  youtube: { connected: boolean; channel: string | null };
  lastExports: { when: string; status: string; health: string }[];
  recentPublishes: { when: string; status: string; title: string; error: string | null }[];
  briefs: { niches: string[]; emailBriefsOn: boolean };
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");
/** Run one lookup; a missing table or column never breaks the whole snapshot. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("support snapshot part failed:", error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

export async function accountSnapshot(userId: string, workspaceId: string | null): Promise<AccountSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const [u] = await db`
    SELECT u.name, u.email, u.email_verified_at, u.status, u.created_at,
      (SELECT count(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS sessions
    FROM users u WHERE u.id = ${userId} AND u.deleted_at IS NULL
  `;
  if (!u) return null;
  const ws = workspaceId;

  const credits = ws
    ? await safe(async () => {
        const c = await creditState(ws);
        if (!c) return null;
        const next = c.refilledAt ? new Date(new Date(c.refilledAt).getTime() + 30 * 86_400_000).toISOString() : null;
        return { balance: c.unlimited ? ("unlimited" as const) : c.balance, monthlyAllowance: c.monthlyGrant, lastRefill: iso(c.refilledAt) || null, nextRefill: iso(next) || null };
      }, null)
    : null;

  const creditHistory = ws
    ? await safe(async () => {
        const rows = await db`
          SELECT t.kind, t.amount, t.balance_after, t.ref, t.created_at FROM credit_transactions t
          JOIN credit_accounts a ON a.id = t.account_id WHERE a.workspace_id = ${ws}
          ORDER BY t.created_at DESC LIMIT 12`;
        return rows.map((r) => ({ when: iso(r.created_at), change: Number(r.amount), balanceAfter: Number(r.balance_after), reason: clip(r.ref || r.kind, 80) }));
      }, [])
    : [];

  const recentGenerations = ws
    ? await safe(async () => {
        const rows = await db`SELECT kind, status, created_at FROM usage_events WHERE workspace_id = ${ws} ORDER BY created_at DESC LIMIT 15`;
        return rows.map((r) => ({ when: iso(r.created_at), kind: clip(r.kind, 30), status: clip(r.status, 20) }));
      }, [])
    : [];

  const failedGenerationsLast7Days = ws
    ? await safe(async () => {
        const [r] = await db`SELECT count(*) AS n FROM usage_events WHERE workspace_id = ${ws} AND status = 'failed' AND created_at > now() - interval '7 days'`;
        return Number(r?.n ?? 0);
      }, 0)
    : 0;

  const recentJobs = ws
    ? await safe(async () => {
        const rows = await db`SELECT type, status, error, created_at FROM jobs WHERE workspace_id = ${ws} ORDER BY created_at DESC LIMIT 8`;
        return rows.map((r) => ({ when: iso(r.created_at), type: clip(r.type, 30), status: clip(r.status, 20), error: r.error ? clip(r.error, 200) : null }));
      }, [])
    : [];

  const { projects, projectCount } = ws
    ? await safe(async () => {
        const rows = await db`
          SELECT name, status, current_stage, updated_at FROM projects
          WHERE workspace_id = ${ws} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 8`;
        const [c] = await db`SELECT count(*) AS n FROM projects WHERE workspace_id = ${ws} AND deleted_at IS NULL`;
        return {
          projects: rows.map((r) => ({ name: clip(r.name, 60), status: clip(r.status, 20), stage: clip(r.current_stage, 30), updated: iso(r.updated_at) })),
          projectCount: Number(c?.n ?? 0),
        };
      }, { projects: [], projectCount: 0 })
    : { projects: [], projectCount: 0 };

  const youtube = ws
    ? await safe(async () => {
        const [y] = await db`SELECT channel_title FROM youtube_connections WHERE workspace_id = ${ws} LIMIT 1`;
        return { connected: Boolean(y), channel: y ? clip(y.channel_title, 80) : null };
      }, { connected: false, channel: null })
    : { connected: false, channel: null };

  const lastExports = ws
    ? await safe(async () => {
        const rows = await db`SELECT status, health, created_at FROM render_requests WHERE workspace_id = ${ws} ORDER BY created_at DESC LIMIT 5`;
        return rows.map((r) => ({ when: iso(r.created_at), status: clip(r.status, 20), health: clip(r.health, 20) }));
      }, [])
    : [];

  const recentPublishes = ws
    ? await safe(async () => {
        const rows = await db`SELECT title, status, error, created_at FROM youtube_publishes WHERE workspace_id = ${ws} ORDER BY created_at DESC LIMIT 5`;
        return rows.map((r) => ({ when: iso(r.created_at), status: clip(r.status, 20), title: clip(r.title, 80), error: r.error ? clip(r.error, 160) : null }));
      }, [])
    : [];

  const briefs = await safe(async () => {
    const rows = await db`SELECT query, email_digest FROM trend_watches WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 8`;
    return { niches: rows.map((r) => clip(r.query, 40)), emailBriefsOn: rows.some((r) => r.email_digest) };
  }, { niches: [], emailBriefsOn: false });

  return {
    account: {
      name: clip(u.name, 80),
      email: String(u.email),
      emailVerified: Boolean(u.email_verified_at),
      status: String(u.status),
      joined: iso(u.created_at),
      activeSessions: Number(u.sessions ?? 0),
    },
    credits,
    creditHistory,
    recentGenerations,
    failedGenerationsLast7Days,
    recentJobs,
    projects,
    projectCount,
    youtube,
    lastExports,
    recentPublishes,
    briefs,
  };
}
