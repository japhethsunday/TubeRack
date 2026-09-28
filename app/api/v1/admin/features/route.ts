import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { FEATURES, featureFlags, putSetting } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/features — every switchable tool and its state. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "features.view");
    const flags = await featureFlags();
    return NextResponse.json({ data: FEATURES.map((f) => ({ ...f, off: Boolean(flags[f.id]?.off), message: flags[f.id]?.message ?? "" })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ id: z.enum(FEATURES.map((f) => f.id) as [string, ...string[]]), off: z.boolean(), message: z.string().trim().max(200).optional() });

/** PUT /api/v1/admin/features — pause or resume one tool (takes effect within ~20 seconds). */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request, "features.edit");
    const input = await parseBody(request, body);
    const flags = await featureFlags();
    await putSetting("features", { ...flags, [input.id]: { off: input.off, message: input.message ?? flags[input.id]?.message ?? "" } }, admin.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
