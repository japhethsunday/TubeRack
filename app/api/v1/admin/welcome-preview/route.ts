import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { sendWelcomePreview } from "@/src/server/growth/lifecycle";
import { toErrorResponse } from "@/src/server/errors";

export const maxDuration = 60;

/** POST /api/v1/admin/welcome-preview — email the whole welcome series to the admin. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "campaigns.create");
    return NextResponse.json({ data: { sent: await sendWelcomePreview(admin.email, admin.name) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
