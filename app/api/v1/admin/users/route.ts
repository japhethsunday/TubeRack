import { NextResponse } from "next/server";
import { adminUsers, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/users?q=&page= — search every account (admins only). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "users.list");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    const page = Math.min(1000, Math.max(1, Number(url.searchParams.get("page")) || 1));
    return NextResponse.json({ data: await adminUsers(q, page) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
