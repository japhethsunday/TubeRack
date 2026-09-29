import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin";
import { bossTodos, isBoss } from "@/src/server/admin-agent/boss";
import { founder } from "@/src/server/founder";
import { notFound, toErrorResponse } from "@/src/server/errors";

export const dynamic = "force-dynamic";

/** GET — the founder's personal to-do list. Anyone else gets a plain 404. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    if (!isBoss(admin)) throw notFound("Page");
    const [todos, f] = await Promise.all([bossTodos(), founder()]);
    return NextResponse.json({ data: { name: f.first || "boss", todos } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
