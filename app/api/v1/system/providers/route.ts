import { NextResponse } from "next/server";
import { describeProviders, describeProvidersWithHealth } from "@/src/server/ai/registry";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse } from "@/src/server/errors";

/**
 * Public provider catalog: configuration presence + capability matrix.
 * Contains no secrets, keys, or URLs — safe for the UI to gate
 * generation features on `configured`.
 */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const health = new URL(request.url).searchParams.get("health") === "1";
    const providers = health ? await describeProvidersWithHealth() : describeProviders();
    return NextResponse.json({ data: { providers } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
