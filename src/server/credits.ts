import { getDb } from "@/src/server/db";
import { BackendError } from "@/src/server/errors";

/**
 * Credits. Every workspace gets a monthly allowance that RESETS to
 * `monthly_grant` every 30 days — unused monthly credits don't roll over.
 * Credits that were bought (credit packs) or gifted (admin, codes,
 * referrals) are "extra" credits: they carry over until used. Monthly
 * credits are spent first. At zero, generation pauses until the next reset
 * or a top-up. Unlimited accounts are never charged.
 */

/**
 * Pricing: the free monthly 100 credits make one full generated video
 * ("autovideo", which covers its own voice-overs and images) or 10 images.
 */
export const CREDIT_COST: Record<string, number> = { text: 1, research: 2, transcription: 5, tts: 5, image: 10, video: 25, autovideo: 100 };
export const DEFAULT_MONTHLY_CREDITS = 100;
export const costOf = (kind: string) => CREDIT_COST[kind] ?? 1;

export interface CreditState {
  accountId: string;
  balance: number;
  /** Bought or gifted credits inside `balance` that carry over at the reset. */
  extra: number;
  monthlyGrant: number;
  unlimited: boolean;
  refilledAt: string | null;
}

/** Load (creating if needed) and apply the monthly refill. */
export async function creditState(workspaceId: string): Promise<CreditState | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`
    INSERT INTO credit_accounts (workspace_id, balance, monthly_grant) VALUES (${workspaceId}, 0, ${DEFAULT_MONTHLY_CREDITS})
    ON CONFLICT (workspace_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id
    RETURNING id, balance, extra_balance, monthly_grant, unlimited, refilled_at`;
  let r = rows[0] as Record<string, unknown>;
  const due = !r.refilled_at || Date.now() - new Date(String(r.refilled_at)).getTime() > 30 * 86_400_000;
  if (due) {
    // Monthly credits reset (unused ones expire); unspent extra credits are kept.
    // Monthly credits are spent first, so the extra left is at most the balance.
    const upd = await db`
      UPDATE credit_accounts
      SET extra_balance = LEAST(extra_balance, balance),
          balance = monthly_grant + LEAST(extra_balance, balance),
          refilled_at = now(), updated_at = now()
      WHERE id = ${String(r.id)} RETURNING id, balance, extra_balance, monthly_grant, unlimited, refilled_at`;
    const before = Number(r.balance);
    r = upd[0] as Record<string, unknown>;
    const change = Number(r.balance) - before;
    if (change !== 0 && r.refilled_at) await db`INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref) VALUES (${String(r.id)}, 'monthly', ${change}, ${Number(r.balance)}, 'Monthly reset: new allowance (unused monthly credits expire)')`;
  }
  return { accountId: String(r.id), balance: Number(r.balance), extra: Math.min(Number(r.extra_balance ?? 0), Number(r.balance)), monthlyGrant: Number(r.monthly_grant), unlimited: Boolean(r.unlimited), refilledAt: r.refilled_at ? new Date(String(r.refilled_at)).toISOString() : null };
}

/**
 * Paid access (AI video clips and AI motion): an unlimited account, or a
 * monthly allowance above the free one. Admins set this per user.
 */
export const TIKTOK_PAID_MESSAGE = "Posting to TikTok is part of the paid plans. The Free plan connects YouTube only. See recktube.xyz/pricing to upgrade.";

export function isPaidPlan(state: Pick<CreditState, "unlimited" | "monthlyGrant"> | null): boolean {
  return Boolean(state && (state.unlimited || state.monthlyGrant > DEFAULT_MONTHLY_CREDITS));
}

/** Throw when the workspace can't afford at least one more generation. */
export async function assertCredits(workspaceId: string, kind = "text"): Promise<void> {
  const state = await creditState(workspaceId);
  if (!state || state.unlimited) return;
  if (state.balance < costOf(kind)) {
    throw new BackendError("FORBIDDEN", "You've used all your credits for this month. They refill automatically every 30 days, or contact support for more.");
  }
}

/** Spend credits for a finished generation (never below zero). */
export async function spendCredits(workspaceId: string, kind: string, ref?: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const cost = costOf(kind);
  const rows = await db`
    UPDATE credit_accounts SET balance = GREATEST(0, balance - ${cost}), extra_balance = LEAST(extra_balance, GREATEST(0, balance - ${cost})), updated_at = now()
    WHERE workspace_id = ${workspaceId} AND NOT unlimited RETURNING id, balance`;
  if (rows[0]) await db`INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref) VALUES (${String(rows[0].id)}, ${`usage:${kind}`}, ${-cost}, ${Number(rows[0].balance)}, ${ref ?? null})`;
}

/** Admin adjustment: add (positive) or remove (negative) credits, with a reason. */
export async function adjustCredits(workspaceId: string, delta: number, reason: string, kind?: string): Promise<CreditState | null> {
  const db = getDb();
  if (!db) return null;
  await creditState(workspaceId);
  // Bought or gifted credits carry over; refunds of spent monthly credits don't.
  const carries = delta > 0 && !/^(refund|reset)/.test(kind ?? "");
  const rows = await db`
    UPDATE credit_accounts
    SET balance = GREATEST(0, balance + ${delta}),
        extra_balance = LEAST(GREATEST(0, balance + ${delta}), extra_balance + ${carries ? delta : 0}),
        updated_at = now()
    WHERE workspace_id = ${workspaceId} RETURNING id, balance`;
  if (rows[0]) await db`INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref) VALUES (${String(rows[0].id)}, ${kind ?? (delta >= 0 ? "admin:add" : "admin:remove")}, ${delta}, ${Number(rows[0].balance)}, ${reason})`;
  return creditState(workspaceId);
}

export async function setCreditPlan(workspaceId: string, plan: { monthlyGrant?: number; unlimited?: boolean }): Promise<CreditState | null> {
  const db = getDb();
  if (!db) return null;
  await creditState(workspaceId);
  if (plan.monthlyGrant !== undefined) await db`UPDATE credit_accounts SET monthly_grant = ${plan.monthlyGrant}, updated_at = now() WHERE workspace_id = ${workspaceId}`;
  if (plan.unlimited !== undefined) await db`UPDATE credit_accounts SET unlimited = ${plan.unlimited}, updated_at = now() WHERE workspace_id = ${workspaceId}`;
  return creditState(workspaceId);
}
