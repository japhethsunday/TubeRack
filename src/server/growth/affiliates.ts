import { randomInt } from "node:crypto";
import { getDb } from "@/src/server/db";
import { backendUnavailable, notFound, validationError } from "@/src/server/errors";

/**
 * Affiliate program. Partners apply, the team approves them, and they share
 * recktube.xyz/go/CODE. A click is counted and remembered for 60 days; a
 * sign-up in that window is credited to the affiliate. When a referred
 * customer pays, a commission (the affiliate's %) is recorded; the team
 * approves and pays it out. Separate from friend referrals (credits).
 */

export const AFF_COOKIE = "rt_aff";
export const AFF_COOKIE_DAYS = 60;
export const DEFAULT_COMMISSION = 30;
const CODE = /^[a-z0-9][a-z0-9-]{2,23}$/;

export const cleanAffCode = (v: string | null | undefined) => {
  const c = (v ?? "").toLowerCase().trim();
  return CODE.test(c) ? c : "";
};

function db() {
  const d = getDb();
  if (!d) throw backendUnavailable("Database");
  return d;
}

function slug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16);
  return base.length >= 3 ? base : "partner";
}

export interface AffiliateSummary {
  status: "none" | "pending" | "approved" | "rejected" | "paused";
  code?: string;
  link?: string;
  commissionPct?: number;
  clicks?: number;
  signups?: number;
  customers?: number;
  earnings?: { pending: number; approved: number; paid: number; currency: string };
  recent?: { when: string; sale: number; commission: number; status: string }[];
  website?: string;
  audience?: string;
  payoutDetails?: string;
}

export async function affiliateSummary(userId: string, appUrl: string): Promise<AffiliateSummary> {
  const d = db();
  const [a] = await d`SELECT * FROM affiliates WHERE user_id = ${userId}`;
  if (!a) return { status: "none" };
  const base: AffiliateSummary = {
    status: String(a.status) as AffiliateSummary["status"],
    code: String(a.code),
    commissionPct: Number(a.commission_pct),
    website: String(a.website),
    audience: String(a.audience),
    payoutDetails: String(a.payout_details),
  };
  if (a.status !== "approved" && a.status !== "paused") return base;
  const [s] = await d`
    SELECT
      (SELECT count(*) FROM users WHERE affiliate_id = ${String(a.id)}) AS signups,
      (SELECT count(DISTINCT referred_user_id) FROM affiliate_commissions WHERE affiliate_id = ${String(a.id)} AND status <> 'void') AS customers`;
  const sums = await d`
    SELECT status, currency, coalesce(sum(commission_minor), 0) AS total FROM affiliate_commissions
    WHERE affiliate_id = ${String(a.id)} AND status <> 'void' GROUP BY status, currency`;
  const currency = String(sums[0]?.currency ?? "USD");
  const sum = (st: string) => Number(sums.filter((r) => r.status === st && r.currency === currency).reduce((n, r) => n + Number(r.total), 0)) / 100;
  const recent = await d`
    SELECT created_at, sale_minor, commission_minor, status FROM affiliate_commissions
    WHERE affiliate_id = ${String(a.id)} ORDER BY created_at DESC LIMIT 10`;
  return {
    ...base,
    link: `${appUrl.replace(/\/$/, "")}/go/${String(a.code)}`,
    clicks: Number(a.clicks),
    signups: Number(s?.signups ?? 0),
    customers: Number(s?.customers ?? 0),
    earnings: { pending: sum("pending"), approved: sum("approved"), paid: sum("paid"), currency },
    recent: recent.map((r) => ({ when: new Date(String(r.created_at)).toISOString(), sale: Number(r.sale_minor) / 100, commission: Number(r.commission_minor) / 100, status: String(r.status) })),
  };
}

/** Apply to the program (or update a pending/rejected application). */
export async function applyAffiliate(userId: string, name: string, input: { website: string; audience: string; payoutDetails: string; code?: string }): Promise<void> {
  const d = db();
  const [existing] = await d`SELECT id, status FROM affiliates WHERE user_id = ${userId}`;
  if (existing && (existing.status === "approved" || existing.status === "paused")) {
    await d`UPDATE affiliates SET website = ${input.website}, audience = ${input.audience}, payout_details = ${input.payoutDetails} WHERE id = ${String(existing.id)}`;
    return;
  }
  const wanted = cleanAffCode(input.code) || slug(name);
  for (let i = 0; i < 6; i++) {
    const code = i === 0 ? wanted : `${wanted.slice(0, 18)}-${randomInt(100, 999)}`;
    const [taken] = await d`SELECT 1 FROM affiliates WHERE code = ${code} AND user_id <> ${userId}`;
    if (taken) continue;
    await d`
      INSERT INTO affiliates (user_id, code, website, audience, payout_details, status)
      VALUES (${userId}, ${code}, ${input.website}, ${input.audience}, ${input.payoutDetails}, 'pending')
      ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, website = EXCLUDED.website, audience = EXCLUDED.audience,
        payout_details = EXCLUDED.payout_details, status = 'pending'`;
    return;
  }
  throw validationError("Couldn't reserve a link name. Try a different one.");
}

/** A click on /go/CODE: counted only for approved affiliates. Returns the code to remember, or "". */
export async function trackClick(raw: string): Promise<string> {
  const code = cleanAffCode(raw);
  if (!code) return "";
  const d = getDb();
  if (!d) return code;
  const [a] = await d`UPDATE affiliates SET clicks = clicks + 1 WHERE code = ${code} AND status = 'approved' RETURNING code`;
  return a ? code : "";
}

/** At sign-up: credit the account to the affiliate whose link was clicked (never to themselves). */
export async function attributeAffiliate(userId: string, raw: string | undefined): Promise<void> {
  const code = cleanAffCode(raw);
  const d = getDb();
  if (!code || !d) return;
  await d`
    UPDATE users SET affiliate_id = a.id FROM affiliates a
    WHERE users.id = ${userId} AND users.affiliate_id IS NULL AND a.code = ${code} AND a.status = 'approved' AND a.user_id <> ${userId}`;
}

/* ---------------- Admin ---------------- */

export async function listAffiliates() {
  const rows = await db()`
    SELECT a.*, u.email, u.name,
      (SELECT count(*) FROM users x WHERE x.affiliate_id = a.id) AS signups,
      (SELECT coalesce(sum(commission_minor), 0) FROM affiliate_commissions c WHERE c.affiliate_id = a.id AND c.status IN ('pending', 'approved')) AS owed_minor,
      (SELECT coalesce(sum(commission_minor), 0) FROM affiliate_commissions c WHERE c.affiliate_id = a.id AND c.status = 'paid') AS paid_minor
    FROM affiliates a JOIN users u ON u.id = a.user_id
    ORDER BY (a.status = 'pending') DESC, a.created_at DESC LIMIT 300`;
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name ?? ""),
    code: String(r.code),
    status: String(r.status),
    commissionPct: Number(r.commission_pct),
    website: String(r.website),
    audience: String(r.audience),
    payoutDetails: String(r.payout_details),
    clicks: Number(r.clicks),
    signups: Number(r.signups),
    owed: Number(r.owed_minor) / 100,
    paid: Number(r.paid_minor) / 100,
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

export async function updateAffiliate(id: string, patch: { status?: string; commissionPct?: number; adminNote?: string }): Promise<void> {
  const d = db();
  const [a] = await d`SELECT id FROM affiliates WHERE id = ${id}`;
  if (!a) throw notFound("Affiliate");
  if (patch.status) await d`UPDATE affiliates SET status = ${patch.status}, approved_at = CASE WHEN ${patch.status} = 'approved' THEN coalesce(approved_at, now()) ELSE approved_at END WHERE id = ${id}`;
  if (patch.commissionPct !== undefined) await d`UPDATE affiliates SET commission_pct = ${patch.commissionPct} WHERE id = ${id}`;
  if (patch.adminNote !== undefined) await d`UPDATE affiliates SET admin_note = ${patch.adminNote} WHERE id = ${id}`;
}

/**
 * Record a sale by a customer (found by email) and create the commission for
 * the affiliate who brought them in. Nothing is created for customers who
 * didn't come through an affiliate.
 */
export async function recordSale(adminId: string, input: { email: string; amount: number; currency: string; note: string }) {
  const d = db();
  const [u] = await d`
    SELECT u.id, u.affiliate_id, a.commission_pct, a.status FROM users u LEFT JOIN affiliates a ON a.id = u.affiliate_id
    WHERE lower(u.email) = ${input.email.toLowerCase()} AND u.deleted_at IS NULL LIMIT 1`;
  if (!u) throw notFound("Customer");
  if (!u.affiliate_id) throw validationError("This customer didn't sign up through an affiliate link.");
  const sale = Math.round(input.amount * 100);
  const commission = Math.round((sale * Number(u.commission_pct)) / 100);
  const [c] = await d`
    INSERT INTO affiliate_commissions (affiliate_id, referred_user_id, sale_minor, commission_minor, currency, note, created_by)
    VALUES (${String(u.affiliate_id)}, ${String(u.id)}, ${sale}, ${commission}, ${input.currency}, ${input.note}, ${adminId})
    RETURNING id`;
  return { id: String(c.id), commission: commission / 100 };
}

export async function listCommissions() {
  const rows = await db()`
    SELECT c.*, a.code, u.email AS customer FROM affiliate_commissions c
    JOIN affiliates a ON a.id = c.affiliate_id LEFT JOIN users u ON u.id = c.referred_user_id
    ORDER BY c.created_at DESC LIMIT 200`;
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    customer: r.customer ? String(r.customer) : "(deleted)",
    sale: Number(r.sale_minor) / 100,
    commission: Number(r.commission_minor) / 100,
    currency: String(r.currency),
    status: String(r.status),
    note: String(r.note),
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}
export async function setCommissionStatus(id: string, status: "approved" | "paid" | "void"): Promise<void> {
  const [c] = await db()`
    UPDATE affiliate_commissions SET status = ${status}, paid_at = CASE WHEN ${status} = 'paid' THEN now() ELSE paid_at END
    WHERE id = ${id} RETURNING id`;
  if (!c) throw notFound("Commission");
}
