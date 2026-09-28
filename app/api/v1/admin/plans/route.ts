import { NextResponse } from "next/server";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { listPlans, planSchema } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";


/** GET /api/v1/admin/plans — subscription plans and credit packs. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "plans.view");
    return NextResponse.json({ data: await listPlans() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/admin/plans — add a plan or pack. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request, "plans.edit");
    const p = await parseBody(request, planSchema);
    const [row] = await adminDb()`
      INSERT INTO plans (name, kind, price_minor, currency, credits, description, active, sort)
      VALUES (${p.name}, ${p.kind}, ${p.priceMinor}, ${p.currency}, ${p.credits}, ${p.description}, ${p.active}, ${p.sort}) RETURNING id`;
    return NextResponse.json({ data: { id: String(row.id) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
