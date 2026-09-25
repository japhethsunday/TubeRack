import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership, assertCanManageMembers, type Role } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, conflict, forbidden, notFound } from "@/src/server/errors";
import { parseBody, parseId, parsePagination, pageResponse, emailSchema } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const ROLES = ["owner", "admin", "editor", "member", "viewer"] as const;

function workspaceIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const idx = parts.indexOf("workspaces");
  return parseId(parts[idx + 1] ?? "", "workspace");
}

/** GET /api/v1/workspaces/[id]/members — list (member+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = workspaceIdFrom(request);
    await requireMembership(workspaceId, user, "member");
    const pagination = parsePagination(request.url, ["created_at", "role"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const totalRows = await db`SELECT COUNT(*)::int AS count FROM memberships WHERE workspace_id = ${workspaceId}`;
    const total = (totalRows[0] as { count: number }).count;
    const rows = await db.unsafe(
      `SELECT m.id, m.workspace_id, m.user_id, m.role, m.created_at, u.email, u.name
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY m.created_at ${pagination.order === "asc" ? "ASC" : "DESC"}
       LIMIT $2 OFFSET $3`,
      [workspaceId, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}

const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES).default("member"),
});

/** POST invite by email (admin+). Owner role cannot be granted this way. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = workspaceIdFrom(request);
    const membership = await requireMembership(workspaceId, user, "member");
    assertCanManageMembers(membership);
    const body = await parseBody(request, inviteSchema);
    if (body.role === "owner") throw forbidden("Ownership transfers separately; invite as admin instead.");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const users = await db`SELECT id FROM users WHERE lower(email) = ${body.email.toLowerCase()} AND deleted_at IS NULL LIMIT 1`;
    if (users.length === 0) throw notFound("User");
    const targetId = String((users[0] as { id: string }).id);
    try {
      const rows = await db`
        INSERT INTO memberships (workspace_id, user_id, role) VALUES (${workspaceId}, ${targetId}, ${body.role})
        RETURNING id, workspace_id, user_id, role, created_at
      `;
      await audit({ workspaceId, userId: user.id, action: "workspace.member_added", resourceType: "membership", resourceId: String((rows[0] as { id: string }).id), metadata: { targetId, role: body.role } });
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (e) {
      if (e instanceof Error && "code" in e && (e as { code: string }).code === "23505") {
        throw conflict("This user is already a member.");
      }
      throw e;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
