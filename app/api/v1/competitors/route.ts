import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { addCompetitor, listCompetitors, removeCompetitor } from "@/src/server/growth/competitors";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { limiterFor } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

/** GET /api/v1/competitors — tracked channels. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await listCompetitors(workspaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/competitors { channel } — track a channel by URL, @handle, or id. */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const limit = limiterFor("write").take(`competitor:${caller.user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const { channel } = await parseBody(request, z.object({ channel: z.string().trim().min(2).max(300) }));
    return NextResponse.json({ data: await addCompetitor(caller.workspaceId, caller.user.id, channel) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}

/** DELETE /api/v1/competitors?id= — stop tracking. */
export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) throw validationError("Missing id.");
    await removeCompetitor(workspaceId, id);
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
