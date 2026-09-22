import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership, assertCanManageBilling } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const grantSchema = z.object({
  workspaceId: z.string().min(1),
  amount: z.number().int().min(1).max(1000000),
  kind: z.string().trim().max(60).default("grant"),
  ref: z.string().trim().max(200).optional(),
});

/** POST /api/v1/credits/grant — owner only. Balance math in a transaction. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, grantSchema);
    const workspaceId = parseId(body.workspaceId, "workspace");
    const membership = await requireMembership(workspaceId, user, "viewer");
    assertCanManageBilling(membership);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const result = await db.begin(async (tx) => {
      const accounts = await tx`
        INSERT INTO credit_accounts (workspace_id, balance) VALUES (${workspaceId}, 0)
        ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
        RETURNING id, balance
      `;
      const account = accounts[0] as { id: string; balance: number };
      const balanceAfter = account.balance + body.amount;
      await tx`UPDATE credit_accounts SET balance = ${balanceAfter}, updated_at = now() WHERE id = ${account.id}`;
      const txs = await tx`
        INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref)
        VALUES (${account.id}, ${body.kind}, ${body.amount}, ${balanceAfter}, ${body.ref ?? null})
        RETURNING id, account_id, kind, amount, balance_after, ref, created_at
      `;
      return { account: { ...account, balance: balanceAfter }, transaction: txs[0] };
    });
    await audit({ workspaceId, userId: user.id, action: "credits.granted", resourceType: "credit_accounts", resourceId: result.account.id, metadata: { amount: body.amount } });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("owner")) {
      throw validationError("Only owners manage billing.");
    }
    return toErrorResponse(error);
  }
}
