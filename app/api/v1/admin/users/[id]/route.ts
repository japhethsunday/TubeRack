import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, adminUserDetail, isAdmin, requireAdmin } from "@/src/server/admin";
import { revokeAllSessions } from "@/src/server/auth";
import { audit } from "@/src/server/audit";
import { forbidden, notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

const body = z.object({ action: z.enum(["suspend", "reactivate", "sign-out", "verify-email"]) });

/** POST /api/v1/admin/users/:id — account actions (admins only, audited). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request, "users.action");
    const id = parseId((await ctx.params).id, "user");
    const { action } = await parseBody(request, body);
    const db = adminDb();
    const [target] = await db`SELECT id, email, email_verified_at, status FROM users WHERE id = ${id} AND deleted_at IS NULL`;
    if (!target) throw notFound("User");
    if (target.id === admin.id) throw forbidden("You can't change your own admin account here.");
    if (isAdmin({ email: String(target.email), emailVerifiedAt: target.email_verified_at ? "y" : null, status: "active" }) && action === "suspend") {
      throw forbidden("Admin accounts can't be suspended from the dashboard.");
    }
    if (action === "suspend") {
      await db`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = ${id}`;
      await revokeAllSessions(id);
    } else if (action === "reactivate") {
      await db`UPDATE users SET status = 'active', updated_at = now() WHERE id = ${id} AND status = 'suspended'`;
    } else if (action === "sign-out") {
      await revokeAllSessions(id);
    } else {
      await db`UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = ${id}`;
    }
    await audit({ userId: admin.id, action: `admin.user.${action}`, resourceType: "user", resourceId: id, metadata: { target: String(target.email) } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/v1/admin/users/:id — permanently delete an account and the
 * workspaces only it belongs to (projects, assets and credits go with them).
 * Shared workspaces stay for their other members. Admins can't be deleted here.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request, "users.delete");
    const id = parseId((await ctx.params).id, "user");
    const db = adminDb();
    const [target] = await db`SELECT id, email, email_verified_at FROM users WHERE id = ${id}`;
    if (!target) throw notFound("User");
    if (target.id === admin.id) throw forbidden("You can't delete your own admin account.");
    if (isAdmin({ email: String(target.email), emailVerifiedAt: target.email_verified_at ? "y" : null, status: "active" })) {
      throw forbidden("Admin accounts can't be deleted from the dashboard.");
    }
    await revokeAllSessions(id);
    const [counts] = await db.begin(async (tx) => {
      const solo = await tx`
        SELECT m.workspace_id FROM memberships m
        WHERE m.user_id = ${id}
          AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.workspace_id = m.workspace_id AND o.user_id <> ${id})
      `;
      const ids = solo.map((r) => String(r.workspace_id));
      if (ids.length) await tx`DELETE FROM workspaces WHERE id IN ${tx(ids)}`;
      await tx`DELETE FROM users WHERE id = ${id}`;
      return [{ workspaces: ids.length }];
    });
    await audit({ userId: admin.id, action: "admin.user.delete", resourceType: "user", resourceId: id, metadata: { target: String(target.email), workspacesDeleted: counts.workspaces } });
    return NextResponse.json({ data: { deleted: true, workspacesDeleted: counts.workspaces } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** GET /api/v1/admin/users/:id — full account detail (admins only). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "users.view");
    const detail = await adminUserDetail(parseId((await ctx.params).id, "user"));
    if (!detail) throw notFound("User");
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
