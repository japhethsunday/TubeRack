import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, forbidden } from "@/src/server/errors";
import { parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

/** GET /api/v1/audit?workspaceId= — owner/admin only, read-only. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const url = new URL(request.url);
    const workspaceId = parseId(url.searchParams.get("workspaceId") ?? "", "workspace");
    const membership = await requireMembership(workspaceId, user, "viewer");
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw forbidden("Audit logs are visible to owners and admins.");
    }
    const pagination = parsePagination(url, ["created_at"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const values: unknown[] = [workspaceId];
    let actionClause = "";
    const action = url.searchParams.get("action");
    if (action) {
      values.push(action);
      actionClause = `AND action = $${values.length}`;
    }
    const totalRows = await db.unsafe(
      `SELECT COUNT(*)::int AS count FROM audit_log WHERE workspace_id = $1 ${actionClause}`,
      values as never[],
    );
    const total = (totalRows[0] as unknown as { count: number }).count;
    const rows = await db.unsafe(
      `SELECT id, workspace_id, user_id, action, resource_type, resource_id, metadata, created_at
       FROM audit_log WHERE workspace_id = $1 ${actionClause}
       ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}
