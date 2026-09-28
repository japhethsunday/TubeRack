import { getDb } from "@/src/server/db";
import { BackendError } from "@/src/server/errors";

/**
 * Credits. Every workspace gets a monthly allowance (refilled to at least
 * `monthly_grant` every 30 days) plus any credits an admin adds. Each
 * successful generation spends credits; at zero, generation pauses until the
 * next refill or an admin top-up. Unlimited accounts are never charged.
 */

export const CREDIT_COST: Record<string, number> = { text: 1, research: 2, transcription: 3, tts: 3, image: 5, video: 20 };
export const costOf = (kind: string) => CREDIT_COST[kind] ?? 1;

export interface CreditState {
  accountId: string;
  balance: number;
  monthlyGrant: number;
  unlimited: boolean;
  refilledAt: string | null;
}

/** Load (creating if needed) and apply the monthly refill. */
export async function creditState(workspaceId: string): Promise<CreditState | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`
    INSERT INTO credit_accounts (workspace_id, balance) VALUES (${workspaceId}, 0)
    ON CONFLICT (workspace_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id
    RETURNING id, balance, monthly_grant, unlimited, refilled_at`;
  let r = rows[0] as Record<string, unknown>;
  const due = !r.refilled_at || Date.now() - new Date(String(r.refilled_at)).getTime() > 30 * 86_400_000;
  if (due) {
    const upd = await db`
      UPDATE credit_accounts SET balance = GREATEST(balance, monthly_grant), refilled_at = now(), updated_at = now()
      WHERE id = ${String(r.id)} RETURNING id, balance, monthly_grant, unlimited, refilled_at`;
    const before = Number(r.balance);
    r = upd[0] as Record<string, unknown>;
    const added = Number(r.balance) - before;
    if (added > 0) await db`INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref) VALUES (${String(r.id)}, 'monthly', ${added}, ${Number(r.balance)}, 'Monthly allowance')`;
  }
  return { accountId: String(r.id), balance: Number(r.balance), monthlyGrant: Number(r.monthly_grant), unlimited: Boolean(r.unlimited), refilledAt: r.refilled_at ? new Date(String(r.refilled_at)).toISOString() : null };
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
    UPDATE credit_accounts SET balance = GREATEST(0, balance - ${cost}), updated_at = now()
    WHERE workspace_id = ${workspaceId} AND NOT unlimited RETURNING id, balance`;
  if (rows[0]) await db`INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref) VALUES (${String(rows[0].id)}, ${`usage:${kind}`}, ${-cost}, ${Number(rows[0].balance)}, ${ref ?? null})`;
}

/** Admin adjustment: add (positive) or remove (negative) credits, with a reason. */
export async function adjustCredits(workspaceId: string, delta: number, reason: string, kind?: string): Promise<CreditState | null> {
  const db = getDb();
  if (!db) return null;
  await creditState(workspaceId);
  const rows = await db`
    UPDATE credit_accounts SET balance = GREATEST(0, balance + ${delta}), updated_at = now()
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
