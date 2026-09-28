import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { defaultWorkspace } from "@/src/server/sync";
import { redeemCode } from "@/src/server/growth/codes";
import { limiterFor } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse } from "@/src/server/errors";
import { sharedLimit } from "@/src/server/shared-limit";
import { parseBody } from "@/src/server/validate";

const body = z.object({ code: z.string().trim().min(1).max(40) });

/** POST /api/v1/credits/redeem — add a bonus code's credits (once per person). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("write").take(`redeem:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await sharedLimit(`redeem:${user.id}`, 20, 3600); // no guessing codes
    const { code } = await parseBody(request, body);
    return NextResponse.json({ data: await redeemCode(user.id, await defaultWorkspace(user), code) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
