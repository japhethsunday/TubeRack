import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership, assertCanManageWorkspace } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, forbidden, notFound } from "@/src/server/errors";
import { parseBody, parseId, nameSchema } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

function idFrom(request: Request): string {
  return parseId(new URL(request.url).pathname.split("/").pop() ?? "", "workspace");
}

/** GET /api/v1/workspaces/[id] */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const membership = await requireMembership(id, user, "viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`SELECT id, name, slug, owner_id, created_at, updated_at FROM workspaces WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
    if (rows.length === 0) throw notFound("Workspace");
    return NextResponse.json({ data: { ...(rows[0] as object), my_role: membership.role } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/v1/workspaces/[id] — rename (admin+). */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const membership = await requireMembership(id, user, "viewer");
    assertCanManageWorkspace(membership);
    const body = await parseBody(request, z.object({ name: nameSchema }));
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      UPDATE workspaces SET name = ${body.name.trim()}, updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, name, slug, owner_id, created_at, updated_at
    `;
    if (rows.length === 0) throw notFound("Workspace");
    await audit({ workspaceId: id, userId: user.id, action: "workspace.updated", resourceType: "workspace", resourceId: id });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/workspaces/[id] — soft-delete (owner only). */
export async function DELETE(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const membership = await requireMembership(id, user, "owner");
    void membership;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      UPDATE workspaces SET deleted_at = now(), updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL RETURNING id
    `;
    if (rows.length === 0) throw notFound("Workspace");
    await audit({ workspaceId: id, userId: user.id, action: "workspace.deleted", resourceType: "workspace", resourceId: id });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof Error && error.message.includes("owner")) throw forbidden("Only owners can delete workspaces.");
    return toErrorResponse(error);
  }
}
