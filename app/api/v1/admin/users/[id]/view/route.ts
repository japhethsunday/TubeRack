import { NextResponse } from "next/server";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { accountSnapshot } from "@/src/server/support/snapshot";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseId } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/users/:id/view — read-only view of what this user sees (audited). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "users.viewas");
    const id = parseId((await ctx.params).id, "user");
    const [m] = await adminDb()`SELECT workspace_id FROM memberships WHERE user_id = ${id} ORDER BY (role = 'owner') DESC, created_at LIMIT 1`;
    const snap = await accountSnapshot(id, m ? String(m.workspace_id) : null);
    if (!snap) throw notFound("User");
    return NextResponse.json({ data: snap }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
