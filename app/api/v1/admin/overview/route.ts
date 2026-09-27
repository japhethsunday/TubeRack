import { NextResponse } from "next/server";
import { adminOverview, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/overview — app-wide metrics (admins only). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "overview");
    return NextResponse.json({ data: await adminOverview() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
