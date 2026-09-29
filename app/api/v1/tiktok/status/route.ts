import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { tiktokPostStatus } from "@/src/server/tiktok/post";
import { toErrorResponse, validationError } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/tiktok/status?publishId= — where a TikTok post is up to. */
export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const publishId = new URL(request.url).searchParams.get("publishId") ?? "";
    if (!/^[\w.~-]{4,128}$/.test(publishId)) throw validationError("Missing post id.");
    return NextResponse.json({ data: await tiktokPostStatus(workspaceId, publishId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
