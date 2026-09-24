import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { videoStatus } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/video-status?id= — upload + processing state of one of your videos. */
export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw validationError("Invalid video id.");
    return NextResponse.json({ data: await videoStatus(workspaceId, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
