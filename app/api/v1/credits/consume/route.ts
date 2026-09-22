import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const consumeSchema = z.object({
  workspaceId: z.string().min(1),
  kind: z.enum(["text", "image", "video", "voice", "music", "render", "transcription", "research"]),
  units: z.number().int().min(1).max(100000),
  model: z.string().max(120).optional(),
  provider: z.string().max(120).optional(),
  ref: z.string().trim().max(200).optional(),
});

/**
 * POST /api/v1/credits/consume — validated server-side consumption.
 * Balance-checked in a transaction; overdrafts rejected, never negative.
 * Future providers call this same path (never the browser directly).
 */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("expensive").take(`expensive:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, consumeSchema);
    const workspaceId = parseId(body.workspaceId, "workspace");
    await requireMembership(workspaceId, user, "editor");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const result = await db.begin(async (tx) => {
      const accounts = await tx`
        INSERT INTO credit_accounts (workspace_id, balance) VALUES (${workspaceId}, 0)
        ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
        RETURNING id, balance
      `;
      const account = accounts[0] as { id: string; balance: number };
      if (account.balance < body.units) {
        throw validationError(`Insufficient credits (balance ${account.balance}, need ${body.units}).`);
      }
      const balanceAfter = account.balance - body.units;
      await tx`UPDATE credit_accounts SET balance = ${balanceAfter}, updated_at = now() WHERE id = ${account.id}`;
      const txs = await tx`
        INSERT INTO credit_transactions (account_id, kind, amount, balance_after, ref)
        VALUES (${account.id}, ${body.kind}, ${-body.units}, ${balanceAfter}, ${body.ref ?? null})
        RETURNING id, account_id, kind, amount, balance_after, ref, created_at
      `;
      await tx`
        INSERT INTO usage_events (workspace_id, user_id, kind, units, model, provider, status, ref)
        VALUES (${workspaceId}, ${user.id}, ${body.kind}, ${body.units}, ${body.model ?? null}, ${body.provider ?? null}, 'completed', ${body.ref ?? null})
      `;
      return { balance: balanceAfter, transaction: txs[0] };
    });
    await audit({ workspaceId, userId: user.id, action: "credits.consumed", resourceType: "credit_accounts", resourceId: workspaceId, metadata: { kind: body.kind, units: body.units } });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
