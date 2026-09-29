import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { getTikTokConnection, hasTikTokStatsScopes, tiktokStats, tiktokStatsEnabled } from "@/src/server/tiktok/client";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/tiktok/stats — followers, likes and recent videos for the connected TikTok account. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    if (!tiktokStatsEnabled()) return NextResponse.json({ data: { state: "unavailable" } });
    const c = await getTikTokConnection(workspaceId);
    if (!c) return NextResponse.json({ data: { state: "not_connected" } });
    if (!hasTikTokStatsScopes(c.scopes)) return NextResponse.json({ data: { state: "reconnect" } });
    return NextResponse.json({ data: { state: "ok", stats: await tiktokStats(workspaceId) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
