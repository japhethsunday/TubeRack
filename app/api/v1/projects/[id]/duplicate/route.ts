import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource, assertCanEditProject, getMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, notFound, forbidden } from "@/src/server/errors";
import { parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  return parseId(parts[parts.indexOf("projects") + 1] ?? "", "project");
}

/** POST /api/v1/projects/[id]/duplicate — deep copy with "(copy)" suffix. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const auth = await authorizeResource("projects", id, user, "viewer");
    const editor = await getMembership(auth.workspaceId, user.id);
    if (!editor) throw forbidden();
    assertCanEditProject(editor);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");

    const copy = await db.begin(async (tx) => {
      const src = await tx`SELECT * FROM projects WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      if (src.length === 0) throw notFound("Project");
      const s = src[0] as Record<string, unknown>;
      const projects = await tx`
        INSERT INTO projects (workspace_id, channel_id, name, content_type, platform, topic, description, goal, stages, current_stage, status)
        VALUES (${auth.workspaceId}, ${s.channel_id as string | null}, ${`${String(s.name)} (copy)`}, ${s.content_type as string}, ${s.platform as string}, ${s.topic as string}, ${s.description as string}, ${s.goal as string}, ${JSON.stringify(s.stages)}, ${s.current_stage as string}, 'draft')
        RETURNING id, workspace_id, channel_id, name, content_type, platform, topic, description, goal, stages, current_stage, status, created_at, updated_at, archived_at, last_opened_at
      `;
      const project = projects[0] as Record<string, unknown>;
      // Copy documents.
      for (const table of ["project_scripts", "project_boards", "project_compositions", "project_intel", "project_packaging"] as const) {
        const docs = await tx.unsafe(`SELECT * FROM ${table} WHERE project_id = $1 LIMIT 1`, [id] as never[]);
        if (docs.length > 0) {
          const d = docs[0] as Record<string, unknown>;
          const cols = Object.keys(d).filter((c) => c !== "id" && c !== "project_id");
          const vals = cols.map((c) => (typeof d[c] === "object" && d[c] !== null ? JSON.stringify(d[c]) : d[c]));
          await tx.unsafe(
            `INSERT INTO ${table} (project_id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})`,
            [String(project.id), ...vals] as never[],
          );
        }
      }
      await tx`
        INSERT INTO project_events (project_id, workspace_id, actor_id, kind, detail)
        VALUES (${String(project.id)}, ${auth.workspaceId}, ${user.id}, 'project.duplicated', ${JSON.stringify({ from: id })})
      `;
      return project;
    });

    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "project.duplicated", resourceType: "projects", resourceId: String(copy.id) });
    return NextResponse.json({ data: copy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
