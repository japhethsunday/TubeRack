import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { listWatches, runWatch } from "@/src/server/growth/trends";
import { providerFailure } from "@/src/server/ai/guard";
import { notFound, rateLimited, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { limiterFor } from "@/src/server/rate-limit";

export const maxDuration = 60;

/** POST /api/v1/trends/scan { id } — scan one watched topic now (~102 units). */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const limit = limiterFor("expensive").take(`trend-scan:${caller.user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));
    const watch = (await listWatches(caller.workspaceId)).find((w) => w.id === id);
    if (!watch) throw notFound("Trend watch");
    return NextResponse.json({ data: await runWatch(watch) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}
