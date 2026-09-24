import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { channelAnalytics } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";

export const maxDuration = 30;

/** GET /api/v1/youtube/analytics?days=28 — private analytics for the connected channel. */
export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const days = Number(new URL(request.url).searchParams.get("days") ?? 28);
    const safe = [7, 28, 90, 365].includes(days) ? days : 28;
    return NextResponse.json({ data: await channelAnalytics(workspaceId, safe) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube Analytics"));
  }
}
