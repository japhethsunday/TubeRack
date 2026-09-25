import { NextResponse } from "next/server";
import { describeProviders } from "@/src/server/ai/registry";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse } from "@/src/server/errors";
import { requireUser } from "@/src/server/auth";

/**
 * Provider catalog (signed-in users only): configuration presence + capability matrix.
 * Contains no secrets, keys, or URLs — safe for the UI to gate
 * generation features on `configured`.
 */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await requireUser();
    return NextResponse.json({ data: { providers: describeProviders() } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
