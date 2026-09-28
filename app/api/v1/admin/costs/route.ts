import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { costReport, putSetting } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
const days = (r: Request) => Math.min(90, Math.max(1, Number(new URL(r.url).searchParams.get("days")) || 7));
const noStore = { headers: { "Cache-Control": "no-store" } };

/** GET /api/v1/admin/costs?days= — estimated provider spend vs credits used. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "costs.view");
    return NextResponse.json({ data: await costReport(days(request)) }, noStore);
  } catch (error) {
    return toErrorResponse(error);
  }
}

const rates = z.object({ rates: z.record(z.string().max(30), z.number().min(0).max(100)) });

/** PUT /api/v1/admin/costs — update cost per generation (USD). */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request, "costs.edit");
    const body = await parseBody(request, rates);
    await putSetting("cost_rates", body.rates, admin.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
