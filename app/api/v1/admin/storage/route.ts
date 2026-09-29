import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { cleanStorage, GRACE_DAYS, moveToR2 } from "@/src/server/storage-cleaner";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { putSetting } from "@/src/server/admin-ops";
import { isR2Active, isR2Configured, r2CorsStatus, r2Diagnose, r2Ping, resetR2ActiveCache } from "@/src/server/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const days = (r: Request) => Math.min(30, Math.max(3, Number(new URL(r.url).searchParams.get("days")) || GRACE_DAYS));

/** GET /api/v1/admin/storage — preview what the cleaner would remove (nothing is deleted). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "system");
    if (new URL(request.url).searchParams.get("r2") === "1") {
      const configured = isR2Configured();
      const problem = configured ? await r2Diagnose() : null;
      const reachable = configured && !problem;
      const cors = reachable ? await r2CorsStatus() : "unknown";
      return NextResponse.json({ data: { configured, reachable, problem, cors, active: await isR2Active() } }, { headers: { "Cache-Control": "no-store" } });
    }
    const graceDays = days(request);
    return NextResponse.json({ data: { ...(await cleanStorage({ dryRun: true, graceDays })), graceDays } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PUT /api/v1/admin/storage — move a batch of files from Supabase Storage to Cloudflare R2 (owner only). */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request, "storage.clean");
    if (!(await isR2Active())) throw validationError("Tap \"Switch new files to R2\" first.");
    const result = await moveToR2(240_000);
    await audit({ userId: admin.id, action: "admin.storage.move_r2", metadata: { ...result } });
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/v1/admin/storage — switch new files to R2 on or off (owner only). */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request, "storage.clean");
    const { active } = (await request.json().catch(() => ({}))) as { active?: boolean };
    if (active && !(isR2Configured() && (await r2Ping()))) throw validationError("Cloudflare R2 isn't reachable yet — check the R2 settings in Vercel.");
    await putSetting("storage_r2", { active: Boolean(active) }, admin.id);
    resetR2ActiveCache();
    await audit({ userId: admin.id, action: "admin.storage.r2_toggle", metadata: { active: Boolean(active) } });
    return NextResponse.json({ data: { active: Boolean(active) } });
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
