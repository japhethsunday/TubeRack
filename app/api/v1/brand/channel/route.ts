import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { BRAND, writeBrandPack } from "@/src/server/brand/channel";
import { putSetting } from "@/src/server/admin-ops";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/v1/brand/channel — the brand kit and the saved channel pack (owner only). */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "brand.view");
    const [row] = await adminDb()`SELECT value FROM admin_settings WHERE key = 'brand_channel'`;
    return NextResponse.json({ data: { brand: BRAND, pack: row?.value ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ brief: z.string().trim().max(600).default("") });

/** POST /api/v1/brand/channel — write a new channel pack and save it. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "brand.write");
    const { brief } = await parseBody(request, body);
    const pack = await writeBrandPack(brief);
    await putSetting("brand_channel", pack, admin.id);
    return NextResponse.json({ data: { brand: BRAND, pack } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
