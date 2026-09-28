import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { createPromoProject, type PromoPackage } from "@/src/server/growth/promo";
import { audit } from "@/src/server/audit";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

const body = z.object({ action: z.literal("project") });

/** POST /api/v1/admin/promo/:id — create (once) a studio project from the promo. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await parseBody(request, body);
    const admin = await requireAdmin(request, "promo.project");
    const id = parseId((await ctx.params).id, "promo");
    const db = adminDb();
    const [p] = await db`SELECT feature, platform, package, project_id FROM promo_videos WHERE id = ${id}`;
    if (!p) throw notFound("Promo");
    if (p.project_id) return NextResponse.json({ data: { projectId: String(p.project_id) } });
    const projectId = await createPromoProject(admin, { feature: String(p.feature), platform: String(p.platform), pkg: p.package as PromoPackage });
    await db`UPDATE promo_videos SET project_id = ${projectId} WHERE id = ${id}`;
    await audit({ userId: admin.id, action: "admin.promo.project", resourceType: "promo_video", resourceId: id, metadata: { projectId } });
    return NextResponse.json({ data: { projectId } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/admin/promo/:id — remove a promo (its studio project, if any, stays). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "promo.delete");
    const id = parseId((await ctx.params).id, "promo");
    await adminDb()`DELETE FROM promo_videos WHERE id = ${id}`;
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
