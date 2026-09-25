import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { requireMembership, assertCanCreateProject } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody, parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { projectConfig } from "@/src/server/resources";
import { z } from "zod";

const COLS = "id, workspace_id, channel_id, name, content_type, platform, topic, description, goal, stages, current_stage, status, created_at, updated_at, archived_at, last_opened_at";

/** GET /api/v1/projects?workspaceId=&status=&channelId=&search= — paginated, sorted. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const url = new URL(request.url);
    const workspaceId = parseId(url.searchParams.get("workspaceId") ?? "", "workspace");
    await requireMembership(workspaceId, user, "viewer");
    const pagination = parsePagination(url, ["created_at", "updated_at", "name"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");

    const conditions = ["workspace_id = $1", "deleted_at IS NULL"];
    const values: unknown[] = [workspaceId];
    const status = url.searchParams.get("status");
    if (status && ["draft", "active", "archived"].includes(status)) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    } else if (!status) {
      conditions.push(`status <> 'archived'`);
    }
    const channelId = url.searchParams.get("channelId");
    if (channelId) {
      values.push(parseId(channelId, "channel"));
      conditions.push(`channel_id = $${values.length}`);
    }
    if (pagination.search) {
      values.push(`%${pagination.search}%`);
      conditions.push(`(name ILIKE $${values.length} OR topic ILIKE $${values.length} OR description ILIKE $${values.length} OR goal ILIKE $${values.length})`);
    }
    const dir = pagination.order === "asc" ? "ASC" : "DESC";
    const sortCol = pagination.sort === "name" ? "name" : pagination.sort === "created_at" ? "created_at" : "updated_at";
    const where = `WHERE ${conditions.join(" AND ")}`;
    const totalRows = await db.unsafe(`SELECT COUNT(*)::int AS count FROM projects ${where}`, values as never[]);
    const total = (totalRows[0] as unknown as { count: number }).count;
    const rows = await db.unsafe(
      `SELECT ${COLS} FROM projects ${where} ORDER BY ${sortCol} ${dir} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/projects?workspaceId= — create draft + event. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const url = new URL(request.url);
    const workspaceId = parseId(url.searchParams.get("workspaceId") ?? "", "workspace");
    const membership = await requireMembership(workspaceId, user, "viewer");
    assertCanCreateProject(membership);
    const body = await parseBody(request, projectConfig.createSchema as never) as Record<string, unknown>;
    if (body.channel_id) {
      const db0 = getDb();
      if (!db0) throw backendUnavailable("Database");
      const ch = await db0`SELECT id FROM channels WHERE id = ${String(body.channel_id)} AND workspace_id = ${workspaceId} LIMIT 1`;
      if (ch.length === 0) throw validationError("Channel does not belong to this workspace.");
    }
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(
      `INSERT INTO projects (workspace_id, channel_id, name, content_type, platform, topic, description, goal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
      [workspaceId, (body.channel_id as string | undefined) ?? null, String(body.name).trim(), String(body.content_type ?? "Long-form video"), String(body.platform ?? "YouTube"), String(body.topic ?? ""), String(body.description ?? ""), String(body.goal ?? "")] as never[],
    );
    const project = rows[0] as Record<string, unknown>;
    await db`
      INSERT INTO project_events (project_id, workspace_id, actor_id, kind, detail)
      VALUES (${String(project.id)}, ${workspaceId}, ${user.id}, 'project.created', ${JSON.stringify({ name: project.name })})
    `;
    await audit({ workspaceId, userId: user.id, action: "project.created", resourceType: "projects", resourceId: String(project.id) });
    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
