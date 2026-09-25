import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

/**
 * Credits: balances change server-side only. Clients can read, owners can
 * grant, members can record validated consumption. No endpoint sets a
 * balance directly — every mutation runs inside a balance-checked
 * transaction and writes a ledger row.
 */

async function accountFor(db: NonNullable<ReturnType<typeof getDb>>, workspaceId: string) {
  const rows = await db`
    INSERT INTO credit_accounts (workspace_id, balance) VALUES (${workspaceId}, 0)
    ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
    RETURNING id, workspace_id, balance, created_at, updated_at
  `;
  return rows[0] as { id: string; workspace_id: string; balance: number };
}

/** GET /api/v1/credits?workspaceId= — balance + recent ledger (viewer+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "", "workspace");
    await requireMembership(workspaceId, user, "viewer");
    const pagination = parsePagination(request.url, ["created_at"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const account = await accountFor(db, workspaceId);
    const totalRows = await db`SELECT COUNT(*)::int AS count FROM credit_transactions WHERE account_id = ${account.id}`;
    const total = (totalRows[0] as { count: number }).count;
    const rows = await db`
      SELECT id, account_id, kind, amount, balance_after, ref, created_at
      FROM credit_transactions WHERE account_id = ${account.id}
      ORDER BY created_at DESC LIMIT ${pagination.limit} OFFSET ${pagination.offset}
    `;
    return NextResponse.json({ data: { account, transactions: pageResponse(rows, total, pagination) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
