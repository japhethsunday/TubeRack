import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { guardProviderCall, recordUsage } from "@/src/server/ai/guard";
import { adjustCredits, costOf } from "@/src/server/credits";
import { isAdmin } from "@/src/server/admin";
import { getDb } from "@/src/server/db";
import { issueVideoPass, verifyVideoPass } from "@/src/server/video-pass";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { requireUser } from "@/src/server/auth";
import { defaultWorkspace } from "@/src/server/sync";

export const dynamic = "force-dynamic";

const body = z.object({ refund: z.string().max(400).optional() });

/**
 * POST /api/v1/credits/video-pass — pay the flat price for one generated video
 * and get a pass that covers its voice-overs and images.
 * POST { refund: pass } — give the credits back when the video couldn't be made at all (once per pass).
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    if (input.refund) {
      // No credit check here: a refund must work even at zero balance.
      const user = await requireUser();
      const caller = { user, workspaceId: await defaultWorkspace(user) };
      const id = verifyVideoPass(input.refund, caller.workspaceId);
      const db = getDb();
      if (!id || !db || isAdmin(caller.user)) return NextResponse.json({ data: { refunded: 0 } });
      const [paid] = await db`
        SELECT 1 FROM credit_transactions t JOIN credit_accounts a ON a.id = t.account_id
        WHERE a.workspace_id = ${caller.workspaceId} AND t.kind = 'usage:autovideo' AND t.ref = ${id}`;
      const [done] = await db`
        SELECT 1 FROM credit_transactions t JOIN credit_accounts a ON a.id = t.account_id
        WHERE a.workspace_id = ${caller.workspaceId} AND t.kind = 'refund:autovideo' AND t.ref = ${id}`;
      if (!paid || done) return NextResponse.json({ data: { refunded: 0 } });
      await adjustCredits(caller.workspaceId, costOf("autovideo"), id, "refund:autovideo");
      return NextResponse.json({ data: { refunded: costOf("autovideo") } });
    }
    const caller = await guardProviderCall("autovideo");
    const id = randomUUID();
    await recordUsage(caller, { kind: "autovideo", provider: "recktube", status: "completed", ref: id });
    return NextResponse.json({ data: { pass: issueVideoPass(caller.workspaceId, id), cost: isAdmin(caller.user) ? 0 : costOf("autovideo") } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
