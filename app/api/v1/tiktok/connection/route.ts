import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { deleteTikTokConnection, getTikTokConnection, isTikTokConfigured } from "@/src/server/tiktok/client";
import { tiktokPaused } from "@/src/server/tiktok/post";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/tiktok/connection — whether TikTok is available and which account is connected. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const paused = await tiktokPaused();
    return NextResponse.json({ data: { configured: isTikTokConfigured() && !paused, paused, connection: await getTikTokConnection(workspaceId) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/tiktok/connection — revoke TikTok access and forget the tokens. */
export async function DELETE() {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    await deleteTikTokConnection(workspaceId);
    await audit({ workspaceId, userId: user.id, action: "tiktok.disconnected" }).catch(() => undefined);
    return NextResponse.json({ data: { disconnected: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
