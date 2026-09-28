import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { listInbox } from "@/src/server/inbox";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/admin/inbox?after= — mail received at support@ / security@. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "inbox.list");
    const after = new URL(request.url).searchParams.get("after") ?? undefined;
    return NextResponse.json({ data: await listInbox(after && /^[A-Za-z0-9_-]{1,100}$/.test(after) ? after : undefined) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
