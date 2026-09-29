import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { getSetting, putSetting } from "@/src/server/admin-ops";
import { cloudflareModelSwitches, isCloudflareAiConfigured } from "@/src/server/ai/cloudflare";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/features/cloudflare — every Cloudflare AI model and whether it's switched on. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "features.view");
    return NextResponse.json({ data: { configured: isCloudflareAiConfigured(), groups: isCloudflareAiConfigured() ? await cloudflareModelSwitches() : [] } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ id: z.string().regex(/^@cf\/[\w.\-]+\/[\w.\-]+$/), on: z.boolean() });

/** PUT /api/v1/admin/features/cloudflare — switch one model on or off (applies within ~20 seconds). */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request, "features.edit");
    const { id, on } = await parseBody(request, body);
    const off = new Set(await getSetting<string[]>("cf_models_off", []));
    if (on) off.delete(id);
    else off.add(id);
    await putSetting("cf_models_off", [...off].slice(0, 300), admin.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
