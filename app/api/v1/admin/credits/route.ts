import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCredits, adminDb, requireAdmin } from "@/src/server/admin";
import { adjustCredits, setCreditPlan } from "@/src/server/credits";
import { audit } from "@/src/server/audit";
import { notifyCreditGift } from "@/src/server/credit-emails";
import { sendPlanChanged, workspaceOwnerEmails } from "@/src/server/admin-emails";
import { notFound, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/credits?q= — every credit account, emptiest first. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "credits.list");
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
    return NextResponse.json({ data: await adminCredits(q) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  workspaceId: z.string().min(1),
  delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  reason: z.string().trim().max(200).optional(),
  monthlyGrant: z.number().int().min(0).max(1_000_000).optional(),
  unlimited: z.boolean().optional(),
  /** Email the owner about added credits / unlimited (default on). */
  notify: z.boolean().optional(),
  /** Set the balance back to the monthly allowance. */
  reset: z.boolean().optional(),
});

/** POST /api/v1/admin/credits — add/remove credits or change a monthly limit (audited). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "credits.change");
    const input = await parseBody(request, body);
    const workspaceId = parseId(input.workspaceId, "workspace");
    const [ws] = await adminDb()`SELECT id FROM workspaces WHERE id = ${workspaceId}`;
    if (!ws) throw notFound("Workspace");
    if (input.delta === undefined && input.monthlyGrant === undefined && input.unlimited === undefined && !input.reset) throw validationError("Nothing to change.");
    let state = null;
    const [before] = await adminDb()`SELECT unlimited, balance, monthly_grant FROM credit_accounts WHERE workspace_id = ${workspaceId}`;
    if (input.reset) {
      if (!before) throw notFound("Credit account");
      const diff = Number(before.monthly_grant) - Number(before.balance);
      state = diff ? await adjustCredits(workspaceId, diff, input.reason?.trim() || "Reset to monthly allowance", "reset:monthly") : state;
      await audit({ userId: admin.id, workspaceId, action: "admin.credits.reset", resourceType: "credit_accounts", resourceId: workspaceId, metadata: { from: Number(before.balance), to: Number(before.monthly_grant) } });
      return NextResponse.json({ data: { ...(state ?? {}), emailed: 0 } });
    }
    if (input.delta) state = await adjustCredits(workspaceId, input.delta, input.reason?.trim() || "Admin adjustment");
    if (input.monthlyGrant !== undefined || input.unlimited !== undefined) state = await setCreditPlan(workspaceId, { monthlyGrant: input.monthlyGrant, unlimited: input.unlimited });
    await audit({ userId: admin.id, workspaceId, action: "admin.credits.change", resourceType: "credit_accounts", resourceId: workspaceId, metadata: { delta: input.delta, monthlyGrant: input.monthlyGrant, unlimited: input.unlimited, reason: input.reason } });
    let emailed = 0;
    if (input.notify !== false) {
      const nowUnlimited = input.unlimited === true && !before?.unlimited;
      if (nowUnlimited) emailed = await notifyCreditGift(workspaceId, { unlimited: true, note: input.reason });
      else if ((input.delta ?? 0) > 0) emailed = await notifyCreditGift(workspaceId, { added: input.delta, balance: state?.unlimited ? undefined : state?.balance, note: input.reason });
      // A new monthly allowance (their plan) is news too.
      if (input.monthlyGrant !== undefined && before && Number(before.monthly_grant) !== input.monthlyGrant && !nowUnlimited) {
        for (const email of await workspaceOwnerEmails(workspaceId)) if (await sendPlanChanged(email, input.monthlyGrant)) emailed++;
      }
    }
    return NextResponse.json({ data: { ...(state ?? {}), emailed } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
