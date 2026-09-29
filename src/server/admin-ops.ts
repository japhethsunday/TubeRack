import { z } from "zod";
import { getDb } from "@/src/server/db";
import { adminDb } from "@/src/server/admin";
import { adjustCredits, CREDIT_COST } from "@/src/server/credits";
import { notifyCreditGift } from "@/src/server/credit-emails";
import { getServerEnv } from "@/src/lib/env";

/**
 * Admin operations: feature switches, provider cost rates, failed jobs,
 * cost report, bulk credits, pricing plans, team, revenue and CSV exports.
 */

const n = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : null);

/* ---------------- Settings (feature switches, cost rates) ---------------- */

export const FEATURES = [
  { id: "all", label: "All AI tools", blurb: "Master switch: pauses every AI generation at once." },
  { id: "text", label: "Writing (ideas, scripts, titles)", blurb: "Script Studio, Content Creator, titles, hooks, analysis." },
  { id: "research", label: "YouTube research", blurb: "Live search, trends, competitors, niches." },
  { id: "tts", label: "Voice-overs", blurb: "Text-to-speech in the studio and auto video." },
  { id: "image", label: "Images", blurb: "Scene images and thumbnails." },
  { id: "video", label: "AI video clips", blurb: "Generated video clips." },
  { id: "transcription", label: "Transcription & captions", blurb: "Caption and transcript generation." },
  { id: "tiktok", label: "TikTok posting", blurb: "Connect TikTok and post finished videos to it." },
] as const;

export type FeatureFlags = Record<string, { off: boolean; message: string }>;

/** Estimated provider cost per successful generation, in US dollars (editable). */
export const DEFAULT_COST_RATES: Record<string, number> = { text: 0.002, research: 0.001, transcription: 0.01, tts: 0.015, image: 0.04, video: 0.35 };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getDb();
  if (!db) return fallback;
  try {
    const [r] = await db`SELECT value FROM admin_settings WHERE key = ${key}`;
    if (!r) return fallback;
    // Lists are stored whole; objects are merged over their defaults.
    if (Array.isArray(fallback)) return (Array.isArray(r.value) ? r.value : fallback) as T;
    return { ...fallback, ...(r.value as T) } as T;
  } catch {
    return fallback;
  }
}

export async function putSetting(key: string, value: unknown, userId: string): Promise<void> {
  await adminDb()`
    INSERT INTO admin_settings (key, value, updated_by, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${userId}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  if (key === "features") flagCache = null;
  if (key === "cf_models_off") void import("@/src/server/ai/cloudflare").then((m) => m.resetCfModelsOff());
}

let flagCache: { at: number; flags: FeatureFlags } | null = null;

export async function featureFlags(): Promise<FeatureFlags> {
  if (flagCache && Date.now() - flagCache.at < 20_000) return flagCache.flags;
  const flags = await getSetting<FeatureFlags>("features", {});
  flagCache = { at: Date.now(), flags };
  return flags;
}

/** Message shown to users when a tool is switched off, or null when it's on. */
export async function featureBlocked(kind?: string): Promise<string | null> {
  const flags = await featureFlags();
  for (const id of ["all", kind ?? ""]) {
    const f = id ? flags[id] : undefined;
    if (f?.off) return f.message?.trim() || "This tool is paused for maintenance. Please try again a little later.";
  }
  return null;
}

export const costRates = () => getSetting<Record<string, number>>("cost_rates", DEFAULT_COST_RATES);

/* ---------------- Failed jobs ---------------- */

export async function failedJobs(days: number) {
  const db = adminDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [usage, jobs, summary] = await Promise.all([
    db`SELECT e.id, e.kind, e.provider, e.model, e.ref, e.created_at, u.id AS user_id, u.email
       FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.status = 'failed' AND e.created_at > ${since} ORDER BY e.created_at DESC LIMIT 200`,
    db`SELECT j.id, j.type, j.provider, j.error, j.attempts, j.created_at, u.id AS user_id, u.email
       FROM jobs j LEFT JOIN users u ON u.id = j.actor_id
       WHERE j.status = 'failed' AND j.created_at > ${since} ORDER BY j.created_at DESC LIMIT 100`,
    db`SELECT kind, count(*) FILTER (WHERE status = 'failed') AS failed, count(*) AS total
       FROM usage_events WHERE created_at > ${since} GROUP BY kind ORDER BY failed DESC`,
  ]);
  return {
    summary: summary.map((r) => ({ kind: String(r.kind), failed: n(r.failed), total: n(r.total), rate: n(r.total) ? Math.round((n(r.failed) / n(r.total)) * 1000) / 10 : 0 })),
    items: [
      ...usage.map((r) => ({ id: String(r.id), source: "generation", kind: String(r.kind), provider: String(r.provider ?? ""), detail: String(r.ref ?? r.model ?? ""), userId: r.user_id ? String(r.user_id) : null, email: r.email ? String(r.email) : "", createdAt: iso(r.created_at)! })),
      ...jobs.map((r) => ({ id: String(r.id), source: "job", kind: String(r.type), provider: String(r.provider ?? ""), detail: String(r.error ?? "").slice(0, 300), userId: r.user_id ? String(r.user_id) : null, email: r.email ? String(r.email) : "", createdAt: iso(r.created_at)! })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/* ---------------- Cost tracker ---------------- */

export async function costReport(days: number) {
  const db = adminDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rates = await costRates();
  const [byKind, byDay, spent] = await Promise.all([
    db`SELECT kind, count(*) FILTER (WHERE status = 'completed') AS ok, count(*) FILTER (WHERE status = 'failed') AS failed
       FROM usage_events WHERE created_at > ${since} GROUP BY kind ORDER BY ok DESC`,
    db`SELECT date_trunc('day', created_at) AS day, kind, count(*) AS c
       FROM usage_events WHERE status = 'completed' AND created_at > ${since} GROUP BY 1, 2 ORDER BY 1`,
    db`SELECT COALESCE(-sum(amount), 0) AS credits FROM credit_transactions WHERE kind LIKE 'usage:%' AND created_at > ${since}`,
  ]);
  const kinds = byKind.map((r) => {
    const ok = n(r.ok);
    const rate = rates[String(r.kind)] ?? 0;
    return { kind: String(r.kind), ok, failed: n(r.failed), rate, cost: Math.round(ok * rate * 100) / 100, creditsEach: CREDIT_COST[String(r.kind)] ?? 1 };
  });
  const days_: Record<string, number> = {};
  for (const r of byDay) {
    const d = new Date(String(r.day)).toISOString().slice(0, 10);
    days_[d] = (days_[d] ?? 0) + n(r.c) * (rates[String(r.kind)] ?? 0);
  }
  return {
    rates,
    kinds,
    totalCost: Math.round(kinds.reduce((s, k) => s + k.cost, 0) * 100) / 100,
    creditsSpent: n(spent[0]?.credits),
    daily: Object.entries(days_).map(([day, cost]) => ({ day, cost: Math.round(cost * 100) / 100 })),
  };
}

/* ---------------- Bulk credits ---------------- */

export const BULK_AUDIENCES = [
  { id: "all", label: "Everyone (active, verified)" },
  { id: "new7", label: "Joined in the last 7 days" },
  { id: "new30", label: "Joined in the last 30 days" },
  { id: "empty", label: "Out of credits (balance 0)" },
  { id: "inactive30", label: "Not active for 30+ days" },
  { id: "emails", label: "Specific email addresses" },
] as const;

function bulkWhere(audience: string): string {
  const base = "u.status = 'active' AND u.email_verified_at IS NOT NULL AND u.deleted_at IS NULL AND m.role = 'owner'";
  switch (audience) {
    case "new7": return `${base} AND u.created_at > now() - interval '7 days'`;
    case "new30": return `${base} AND u.created_at > now() - interval '30 days'`;
    case "empty": return `${base} AND a.balance = 0 AND a.unlimited = false`;
    case "inactive30": return `${base} AND NOT EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.last_used_at > now() - interval '30 days')`;
    case "emails": return `${base} AND lower(u.email) = ANY($1)`;
    default: return base;
  }
}

export async function bulkTargets(audience: string, emails: string[]) {
  const db = adminDb();
  const list = emails.map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 500);
  const sql = `SELECT DISTINCT ON (m.workspace_id) m.workspace_id, u.email FROM memberships m
    JOIN users u ON u.id = m.user_id LEFT JOIN credit_accounts a ON a.workspace_id = m.workspace_id
    WHERE ${bulkWhere(audience)} LIMIT 5000`;
  const rows = audience === "emails" ? await db.unsafe(sql, [list]) : await db.unsafe(sql);
  return rows.map((r) => ({ workspaceId: String(r.workspace_id), email: String(r.email) }));
}

export async function bulkGrant(audience: string, emails: string[], amount: number, reason: string, notify: boolean) {
  const targets = await bulkTargets(audience, emails);
  let granted = 0;
  let emailed = 0;
  const started = Date.now();
  for (const t of targets) {
    if (Date.now() - started > 240_000) break; // stay inside the function time limit
    const state = await adjustCredits(t.workspaceId, amount, reason || "Bonus credits", "admin:bulk");
    granted++;
    if (notify) {
      emailed += await notifyCreditGift(t.workspaceId, { added: amount, balance: state?.unlimited ? undefined : state?.balance, note: reason }).catch(() => 0);
      await new Promise((r) => setTimeout(r, 300)); // pace the email provider
    }
  }
  return { matched: targets.length, granted, emailed };
}

/* ---------------- Plans ---------------- */

export const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["subscription", "pack"]),
  priceMinor: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  credits: z.number().int().min(0).max(10_000_000),
  description: z.string().trim().max(300).default(""),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(1000).default(0),
});


export async function listPlans() {
  const rows = await adminDb()`SELECT * FROM plans ORDER BY sort, created_at`;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), kind: String(r.kind), priceMinor: n(r.price_minor), currency: String(r.currency), credits: n(r.credits), description: String(r.description), active: Boolean(r.active), sort: n(r.sort) }));
}

/* ---------------- Team ---------------- */

export async function listTeam() {
  const rows = await adminDb()`SELECT m.email, m.role, m.created_at, u.name FROM admin_members m LEFT JOIN users u ON lower(u.email) = m.email ORDER BY m.created_at`;
  return rows.map((r) => ({ email: String(r.email), role: String(r.role), name: r.name ? String(r.name) : "", createdAt: iso(r.created_at)! }));
}

/* ---------------- Revenue (Paystack) ---------------- */

export async function paystackRevenue(days: number) {
  const key = getServerEnv().PAYSTACK_SECRET_KEY;
  if (!key) return { connected: false as const };
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const res = await fetch(`https://api.paystack.co/transaction?perPage=100&from=${encodeURIComponent(from)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { connected: true as const, error: `Paystack responded ${res.status}. Check the secret key.` };
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const tx = (body.data ?? []).map((t) => ({
    reference: String(t.reference ?? ""),
    status: String(t.status ?? ""),
    amount: n(t.amount) / 100,
    currency: String(t.currency ?? ""),
    email: String((t.customer as { email?: string } | undefined)?.email ?? ""),
    channel: String(t.channel ?? ""),
    paidAt: iso(t.paid_at ?? t.created_at),
    message: String(t.gateway_response ?? ""),
  }));
  const totals: Record<string, { success: number; failed: number; count: number }> = {};
  for (const t of tx) {
    const c = (totals[t.currency] ??= { success: 0, failed: 0, count: 0 });
    c.count++;
    if (t.status === "success") c.success += t.amount;
    else if (t.status === "failed" || t.status === "abandoned") c.failed += t.amount;
  }
  return { connected: true as const, transactions: tx, totals };
}

/* ---------------- CSV exports ---------------- */

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");

export async function exportCsv(kind: string): Promise<{ name: string; csv: string } | null> {
  const db = adminDb();
  const day = new Date().toISOString().slice(0, 10);
  if (kind === "users") {
    const rows = await db`
      SELECT u.email, u.name, u.status, (u.email_verified_at IS NOT NULL) AS verified, u.marketing_opt_in, u.signup_source, u.created_at,
             a.balance, a.monthly_grant, a.unlimited
      FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner' LEFT JOIN credit_accounts a ON a.workspace_id = m.workspace_id
      WHERE u.deleted_at IS NULL ORDER BY u.created_at`;
    return { name: `recktube-users-${day}.csv`, csv: toCsv(rows as unknown as Record<string, unknown>[], ["email", "name", "status", "verified", "marketing_opt_in", "signup_source", "created_at", "balance", "monthly_grant", "unlimited"]) };
  }
  if (kind === "credits") {
    const rows = await db`
      SELECT t.created_at, u.email, t.kind, t.amount, t.balance_after, t.ref
      FROM credit_transactions t JOIN credit_accounts a ON a.id = t.account_id
      LEFT JOIN memberships m ON m.workspace_id = a.workspace_id AND m.role = 'owner' LEFT JOIN users u ON u.id = m.user_id
      ORDER BY t.created_at DESC LIMIT 50000`;
    return { name: `recktube-credit-transactions-${day}.csv`, csv: toCsv(rows as unknown as Record<string, unknown>[], ["created_at", "email", "kind", "amount", "balance_after", "ref"]) };
  }
  if (kind === "usage") {
    const rows = await db`
      SELECT e.created_at, u.email, e.kind, e.status, e.provider, e.model
      FROM usage_events e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC LIMIT 50000`;
    return { name: `recktube-generations-${day}.csv`, csv: toCsv(rows as unknown as Record<string, unknown>[], ["created_at", "email", "kind", "status", "provider", "model"]) };
  }
  return null;
}
