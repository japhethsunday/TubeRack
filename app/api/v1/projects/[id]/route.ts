import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource, assertCanEditProject, assertCanDeleteProject, getMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, notFound, forbidden } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { projectConfig } from "@/src/server/resources";

const COLS = "id, workspace_id, channel_id, name, content_type, platform, topic, description, goal, stages, current_stage, status, created_at, updated_at, archived_at, last_opened_at";

function idFrom(request: Request): string {
  return parseId(new URL(request.url).pathname.split("/").pop() ?? "", "project");
}

/** GET /api/v1/projects/[id] — viewer+. Touches last_opened_at. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    await authorizeResource("projects", id, user, "viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    await db`UPDATE projects SET last_opened_at = now() WHERE id = ${id}`;
    const rows = await db.unsafe(`SELECT ${COLS} FROM projects WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [id] as never[]);
    if (rows.length === 0) throw notFound("Project");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH — rename/update (editor+). Status transitions set archived_at server-side. */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const auth = await authorizeResource("projects", id, user, "viewer");
    const editor = await getMembership(auth.workspaceId, user.id);
    if (!editor) throw forbidden();
    assertCanEditProject(editor);
    const body = await parseBody(request, projectConfig.patchSchema as never) as Record<string, unknown>;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    if (body.channel_id) {
      const ch = await db`SELECT id FROM channels WHERE id = ${String(body.channel_id)} AND workspace_id = ${auth.workspaceId} LIMIT 1`;
      if (ch.length === 0) {
        const { validationError } = await import("@/src/server/errors");
        throw validationError("Channel does not belong to this workspace.");
      }
    }
    const allowed = ["name", "channel_id", "content_type", "platform", "topic", "description", "goal", "current_stage", "status", "last_opened_at"] as const;
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (key === "status" && body[key] !== "archived") {
        sets.push(`archived_at = NULL`);
        continue;
      }
      if (key === "status" && body[key] === "archived") {
        sets.push(`archived_at = now()`);
      }
      vals.push(typeof body[key] === "string" ? String(body[key]).trim() : body[key]);
      sets.push(`${key} = $${vals.length}`);
    }
    if (body.stages !== undefined) {
      vals.push(JSON.stringify(body.stages));
      sets.push(`stages = $${vals.length}`);
    }
    if (sets.length === 0) {
      const { validationError } = await import("@/src/server/errors");
      throw validationError("No writable fields provided.");
    }
    const rows = await db.unsafe(
      `UPDATE projects SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length + 1} AND deleted_at IS NULL RETURNING ${COLS}`,
      [...vals, id] as never[],
    );
    if (rows.length === 0) throw notFound("Project");
    await db`INSERT INTO project_events (project_id, workspace_id, actor_id, kind) VALUES (${id}, ${auth.workspaceId}, ${user.id}, 'project.updated')`;
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "project.updated", resourceType: "projects", resourceId: id });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE — hard delete with cascade (admin+). Children vanish via FK; audited first. */
export async function DELETE(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const auth = await authorizeResource("projects", id, user, "viewer");
    const admin = await getMembership(auth.workspaceId, user.id);
    if (!admin) throw forbidden();
    assertCanDeleteProject(admin);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "project.deleted", resourceType: "projects", resourceId: id });
    // Storage objects are removed best-effort after the row delete below.
    const assets = await db`SELECT storage_key FROM media_assets WHERE project_id = ${id} AND storage_key IS NOT NULL`;
    const keys = assets as unknown as { storage_key: string }[];
    const result = await db`DELETE FROM projects WHERE id = ${id} RETURNING id`;
    if (result.length === 0) throw notFound("Project");
    const { storageDelete } = await import("@/src/server/storage");
    for (const a of keys) {
      await storageDelete(a.storage_key);
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
