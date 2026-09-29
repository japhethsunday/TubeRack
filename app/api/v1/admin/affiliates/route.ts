import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { listAffiliates, listCommissions, recordSale, setCommissionStatus, updateAffiliate } from "@/src/server/growth/affiliates";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/affiliates — partners and commissions. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "affiliates.view");
    const [affiliates, commissions] = await Promise.all([listAffiliates(), listCommissions()]);
    return NextResponse.json({ data: { affiliates, commissions } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patch = z.union([
  z.object({ affiliateId: z.string().min(1), status: z.enum(["approved", "rejected", "paused", "pending"]).optional(), commissionPct: z.number().int().min(0).max(90).optional(), adminNote: z.string().max(500).optional() }),
  z.object({ commissionId: z.string().min(1), status: z.enum(["approved", "paid", "void"]) }),
]);

/** PATCH — approve/pause an affiliate, change their %, or move a commission to approved/paid/void. */
export async function PATCH(request: Request) {
  try {
    await requireAdmin(request, "affiliates.manage");
    const p = await parseBody(request, patch);
    if ("commissionId" in p) await setCommissionStatus(p.commissionId, p.status);
    else await updateAffiliate(p.affiliateId, p);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const sale = z.object({
  email: z.string().trim().email(),
  amount: z.number().positive().max(100000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  note: z.string().trim().max(300).default(""),
});

/** POST — record a paying customer's sale; creates the commission for their affiliate. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "affiliates.manage");
    const input = await parseBody(request, sale);
    return NextResponse.json({ data: await recordSale(admin.id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
