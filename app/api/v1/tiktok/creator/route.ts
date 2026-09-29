import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { creatorInfo } from "@/src/server/tiktok/client";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/tiktok/creator — what the connected account may post now (privacy options, limits). */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    return NextResponse.json({ data: await creatorInfo(workspaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
