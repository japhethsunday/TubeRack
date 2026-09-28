import { NextResponse } from "next/server";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { planSchema } from "@/src/server/admin-ops";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/plans/:id — edit a plan. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "plans.edit");
    const id = parseId((await ctx.params).id, "plan");
    const p = await parseBody(request, planSchema);
    const rows = await adminDb()`
      UPDATE plans SET name = ${p.name}, kind = ${p.kind}, price_minor = ${p.priceMinor}, currency = ${p.currency}, credits = ${p.credits},
        description = ${p.description}, active = ${p.active}, sort = ${p.sort}, updated_at = now()
      WHERE id = ${id} RETURNING id`;
    if (!rows.length) throw notFound("Plan");
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/admin/plans/:id */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "plans.edit");
    const id = parseId((await ctx.params).id, "plan");
    await adminDb()`DELETE FROM plans WHERE id = ${id}`;
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
