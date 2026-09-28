import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { cleanStorage, GRACE_DAYS } from "@/src/server/storage-cleaner";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const days = (r: Request) => Math.min(30, Math.max(3, Number(new URL(r.url).searchParams.get("days")) || GRACE_DAYS));

/** GET /api/v1/admin/storage — preview what the cleaner would remove (nothing is deleted). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "system");
    const graceDays = days(request);
    return NextResponse.json({ data: { ...(await cleanStorage({ dryRun: true, graceDays })), graceDays } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/admin/storage — delete unused files now (owner only). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "storage.clean");
    const graceDays = days(request);
    const report = await cleanStorage({ dryRun: false, graceDays });
    await audit({ userId: admin.id, action: "admin.storage.clean", metadata: { ...report, graceDays } });
    return NextResponse.json({ data: { ...report, graceDays } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
