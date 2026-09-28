import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { failedJobs } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";
const days = (r: Request) => Math.min(90, Math.max(1, Number(new URL(r.url).searchParams.get("days")) || 7));
const noStore = { headers: { "Cache-Control": "no-store" } };

/** GET /api/v1/admin/failed?days= — failed generations and jobs across all users. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "jobs.view");
    return NextResponse.json({ data: await failedJobs(days(request)) }, noStore);
  } catch (error) {
    return toErrorResponse(error);
  }
}
