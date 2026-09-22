import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

/** GET /api/v1/usage?workspaceId= — usage history (viewer+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "", "workspace");
    await requireMembership(workspaceId, user, "viewer");
    const pagination = parsePagination(request.url, ["created_at"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const totalRows = await db`SELECT COUNT(*)::int AS count FROM usage_events WHERE workspace_id = ${workspaceId}`;
    const total = (totalRows[0] as { count: number }).count;
    const rows = await db`
      SELECT id, workspace_id, user_id, kind, units, model, provider, status, ref, created_at
      FROM usage_events WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT ${pagination.limit} OFFSET ${pagination.offset}
    `;
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}
