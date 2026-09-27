import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { defaultWorkspace } from "@/src/server/sync";
import { creditState, CREDIT_COST } from "@/src/server/credits";
import { isAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/credits/me — the signed-in user's credit balance and costs. */
export async function GET() {
  try {
    const user = await requireUser();
    const state = await creditState(await defaultWorkspace(user));
    return NextResponse.json({ data: { balance: state?.balance ?? 0, monthlyGrant: state?.monthlyGrant ?? 0, unlimited: isAdmin(user) || Boolean(state?.unlimited), refilledAt: state?.refilledAt ?? null, costs: CREDIT_COST } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
