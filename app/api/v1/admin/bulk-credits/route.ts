import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { BULK_AUDIENCES, bulkGrant, bulkTargets } from "@/src/server/admin-ops";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  audience: z.enum(BULK_AUDIENCES.map((a) => a.id) as [string, ...string[]]),
  emails: z.array(z.string().trim().max(254)).max(500).optional(),
  amount: z.number().int().min(1).max(100_000).optional(),
  reason: z.string().trim().max(200).optional(),
  notify: z.boolean().optional(),
  /** true = only count who would receive it. */
  preview: z.boolean().optional(),
});

/** POST /api/v1/admin/bulk-credits — give credits to a group (preview first). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "bulk.grant");
    const input = await parseBody(request, body);
    if (input.audience === "emails" && !input.emails?.length) throw validationError("Add at least one email address.");
    if (input.preview) {
      const t = await bulkTargets(input.audience, input.emails ?? []);
      return NextResponse.json({ data: { matched: t.length, sample: t.slice(0, 8).map((x) => x.email) } });
    }
    if (!input.amount) throw validationError("Enter how many credits to give.");
    const result = await bulkGrant(input.audience, input.emails ?? [], input.amount, input.reason ?? "", input.notify !== false);
    await audit({ userId: admin.id, action: "admin.credits.bulk", resourceType: "credit_accounts", metadata: { audience: input.audience, amount: input.amount, ...result } });
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
