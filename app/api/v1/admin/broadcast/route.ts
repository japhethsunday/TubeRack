import { NextResponse } from "next/server";
import { z } from "zod";
import { adminBroadcast, requireAdmin } from "@/src/server/admin";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const body = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().max(1000).default("") });

/** POST /api/v1/admin/broadcast — in-app announcement to every active user. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "broadcast");
    const input = await parseBody(request, body);
    const sent = await adminBroadcast(input.title, input.body);
    await audit({ userId: admin.id, action: "admin.broadcast.sent", metadata: { title: input.title, recipients: sent } });
    return NextResponse.json({ data: { sent } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
