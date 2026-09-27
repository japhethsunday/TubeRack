import { NextResponse } from "next/server";
import { adminAudit, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/audit?page=&action= — security and activity log (admins only). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "audit.view");
    const url = new URL(request.url);
    const page = Math.min(500, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const action = (url.searchParams.get("action") ?? "").replace(/[^a-z._-]/gi, "").slice(0, 40);
    return NextResponse.json({ data: await adminAudit(page, action) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
