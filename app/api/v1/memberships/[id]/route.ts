import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership, assertCanManageMembers, type Role } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, forbidden, notFound, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const ROLES = ["owner", "admin", "editor", "member", "viewer"] as const;

function idFrom(request: Request): string {
  return parseId(new URL(request.url).pathname.split("/").pop() ?? "", "membership");
}

async function lastOwnerGuard(workspaceId: string, membershipId: string): Promise<void> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    SELECT m.id, m.role FROM memberships m WHERE m.workspace_id = ${workspaceId} AND m.role = 'owner'
  `;
  const owners = rows as unknown as { id: string; role: string }[];
  if (owners.length === 1 && owners[0].id === membershipId) {
    throw forbidden("A workspace must keep at least one owner.");
  }
}

/** PATCH /api/v1/memberships/[id] — change role (admin+). */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const body = await parseBody(request, z.object({ role: z.enum(ROLES) }));
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const found = await db`SELECT id, workspace_id, user_id, role FROM memberships WHERE id = ${id} LIMIT 1`;
    if (found.length === 0) throw notFound("Membership");
    const target = found[0] as unknown as { id: string; workspace_id: string; user_id: string; role: Role };
    const membership = await requireMembership(target.workspace_id, user, "member");
    assertCanManageMembers(membership);
    if (target.user_id === user.id) throw forbidden("You cannot change your own role.");
    if ((body.role as string) === "owner") throw forbidden("Ownership transfers separately.");
    // Only owners can change another owner's role.
    if (target.role === "owner" && membership.role !== "owner") throw forbidden("Only an owner can change an owner's role.");
    if (target.role === "owner" && (body.role as string) !== "owner") {
      await lastOwnerGuard(target.workspace_id, target.id);
    }
    const rows = await db`
      UPDATE memberships SET role = ${body.role} WHERE id = ${id}
      RETURNING id, workspace_id, user_id, role, created_at
    `;
    await audit({ workspaceId: target.workspace_id, userId: user.id, action: "workspace.role_changed", resourceType: "membership", resourceId: id, metadata: { role: body.role } });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/memberships/[id] — remove member (admin+, or self). */
export async function DELETE(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const found = await db`SELECT id, workspace_id, user_id, role FROM memberships WHERE id = ${id} LIMIT 1`;
    if (found.length === 0) throw notFound("Membership");
    const target = found[0] as unknown as { id: string; workspace_id: string; user_id: string; role: Role };
    const self = target.user_id === user.id;
    if (!self) {
      const membership = await requireMembership(target.workspace_id, user, "member");
      assertCanManageMembers(membership);
      if (target.role === "owner" && membership.role !== "owner") throw forbidden("Only an owner can remove an owner.");
    } else {
      await requireMembership(target.workspace_id, user, "viewer");
    }
    if (target.role === "owner") await lastOwnerGuard(target.workspace_id, target.id);
    await db`DELETE FROM memberships WHERE id = ${id}`;
    await audit({ workspaceId: target.workspace_id, userId: user.id, action: "workspace.member_removed", resourceType: "membership", resourceId: id });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function validateRole(role: string): asserts role is Role {
  if (!(ROLES as readonly string[]).includes(role)) throw validationError("Invalid role.");
}
