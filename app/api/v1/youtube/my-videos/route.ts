import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { myVideos } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/youtube/my-videos — latest uploads on the connected channel (incl. scheduled). */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await myVideos(workspaceId, 30) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
