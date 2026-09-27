import { NextResponse } from "next/server";
import { adminUsageFeed, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/usage?status= — latest generations across the app. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "usage.view");
    const status = new URL(request.url).searchParams.get("status");
    return NextResponse.json({ data: await adminUsageFeed(status === "failed" || status === "completed" ? status : "") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
