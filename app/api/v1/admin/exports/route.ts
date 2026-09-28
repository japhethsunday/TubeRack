import { requireAdmin } from "@/src/server/admin";
import { exportCsv } from "@/src/server/admin-ops";
import { audit } from "@/src/server/audit";
import { notFound, toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/admin/exports?kind=users|credits|usage — CSV download. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request, "export.download");
    const kind = new URL(request.url).searchParams.get("kind") ?? "";
    const file = await exportCsv(kind);
    if (!file) throw notFound("Export");
    await audit({ userId: admin.id, action: "admin.export", metadata: { kind } });
    return new Response(`﻿${file.csv}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
