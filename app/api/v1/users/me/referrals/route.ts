import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { getServerEnv } from "@/src/lib/env";
import { referralSummary } from "@/src/server/growth/referrals";
import { backendUnavailable, rateLimited, toErrorResponse } from "@/src/server/errors";
import { limiterFor, callerKey } from "@/src/server/rate-limit";

/** GET /api/v1/users/me/referrals — the user's invite link and what it has earned. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`ref:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const summary = await referralSummary(user.id, getServerEnv().APP_URL);
    if (!summary) throw backendUnavailable("Invites");
    return NextResponse.json({ data: { ...summary, verified: Boolean(user.emailVerifiedAt) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
