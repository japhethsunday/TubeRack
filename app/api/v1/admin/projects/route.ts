import { NextResponse } from "next/server";
import { adminProjects, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/projects?q= — recent projects across every workspace. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "projects.view");
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
    return NextResponse.json({ data: await adminProjects(q) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
