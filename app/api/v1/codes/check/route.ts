import { NextResponse } from "next/server";
import { checkCode } from "@/src/server/growth/codes";
import { sharedLimit } from "@/src/server/shared-limit";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/codes/check?code= — sign-up page preview of a bonus code (rate-limited so codes can't be guessed). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("auth").take(`code-check:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await sharedLimit(`code-check:${clientKey(request)}`, 20, 3600);
    const code = new URL(request.url).searchParams.get("code") ?? "";
    return NextResponse.json({ data: await checkCode(code.slice(0, 40)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
