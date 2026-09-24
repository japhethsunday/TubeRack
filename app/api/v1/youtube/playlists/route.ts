import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { myPlaylists } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/youtube/playlists — playlists on the connected channel. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await myPlaylists(workspaceId) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
