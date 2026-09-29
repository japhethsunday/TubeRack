import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { putSetting } from "@/src/server/admin-ops";
import { MAX_PER_DAY, autopilotSettings, runPromoAutopilot } from "@/src/server/growth/promo-autopilot";
import { sharedLimit } from "@/src/server/shared-limit";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET — autopilot settings. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "promo.list");
    return NextResponse.json({ data: await autopilotSettings() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const settings = z.object({ enabled: z.boolean(), perDay: z.number().int().min(1).max(MAX_PER_DAY) });

/** PUT — switch autopilot on/off and choose how many a day. */
export async function PUT(request: Request) {
  try {
    const input = await parseBody(request, settings);
    const admin = await requireAdmin(request, "promo.write");
    await putSetting("promo_autopilot", input, admin.id);
    await audit({ userId: admin.id, action: "admin.promo.autopilot", metadata: input });
    return NextResponse.json({ data: input });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const run = z.object({ count: z.number().int().min(1).max(MAX_PER_DAY).default(1) });

/** POST — write promos right now (does not wait for tomorrow). */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, run);
    const admin = await requireAdmin(request, "promo.write");
    await sharedLimit(`promo-autopilot:${admin.id}`, 6, 3600);
    const r = await runPromoAutopilot({ force: true, count: input.count, createdBy: admin.id });
    return NextResponse.json({ data: r });
  } catch (error) {
    return toErrorResponse(error);
  }
}
