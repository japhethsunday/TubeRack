import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { competitorReport } from "@/src/server/growth/competitors";
import { providerFailure } from "@/src/server/ai/guard";
import { rateLimited, toErrorResponse } from "@/src/server/errors";
import { limiterFor } from "@/src/server/rate-limit";

export const maxDuration = 60;

/** GET /api/v1/competitors/report — refresh uploads, outliers, cadence (~2 units/channel). */
export async function GET() {
  try {
    const caller = await requireWorkspace("viewer");
    const limit = limiterFor("expensive").take(`competitor-report:${caller.user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    return NextResponse.json({ data: await competitorReport(caller.workspaceId) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}
