import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { paystackRevenue } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";
const days = (r: Request) => Math.min(90, Math.max(1, Number(new URL(r.url).searchParams.get("days")) || 7));
const noStore = { headers: { "Cache-Control": "no-store" } };

/** GET /api/v1/admin/revenue?days= — Paystack transactions and totals. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "revenue.view");
    return NextResponse.json({ data: await paystackRevenue(days(request)) }, noStore);
  } catch (error) {
    return toErrorResponse(error);
  }
}
