import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { getServerEnv } from "@/src/lib/env";
import { affiliateSummary, applyAffiliate } from "@/src/server/growth/affiliates";
import { rateLimited, toErrorResponse } from "@/src/server/errors";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { parseBody } from "@/src/server/validate";

/** GET /api/v1/users/me/affiliate — the user's affiliate status, link and earnings. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`aff:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    return NextResponse.json({ data: await affiliateSummary(user.id, getServerEnv().APP_URL) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  website: z.string().trim().max(300).default(""),
  audience: z.string().trim().min(10, "Tell us a little about your audience.").max(1000),
  payoutDetails: z.string().trim().max(500).default(""),
  code: z.string().trim().max(24).optional(),
});

/** POST /api/v1/users/me/affiliate — apply to the affiliate program, or update details. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`aff:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const input = await parseBody(request, body);
    await applyAffiliate(user.id, user.name || user.email.split("@")[0], input);
    return NextResponse.json({ data: await affiliateSummary(user.id, getServerEnv().APP_URL) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
