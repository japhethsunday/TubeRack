import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

function projectIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  return parseId(parts[parts.indexOf("projects") + 1] ?? "", "project");
}

/** GET /api/v1/projects/[id]/events — project activity (viewer+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const projectId = projectIdFrom(request);
    await authorizeResource("projects", projectId, user, "viewer");
    const pagination = parsePagination(request.url, ["created_at"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const totalRows = await db`SELECT COUNT(*)::int AS count FROM project_events WHERE project_id = ${projectId}`;
    const total = (totalRows[0] as { count: number }).count;
    const dir = pagination.order === "asc" ? "ASC" : "DESC";
    const rows = await db.unsafe(
      `SELECT id, project_id, workspace_id, actor_id, kind, detail, created_at FROM project_events
       WHERE project_id = $1 ORDER BY created_at ${dir} LIMIT $2 OFFSET $3`,
      [projectId, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}
