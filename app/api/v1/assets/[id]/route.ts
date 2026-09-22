import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource, assertCanEditProject, assertCanDeleteProject, getMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, notFound, validationError, forbidden } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { storageDelete } from "@/src/server/storage";

const COLS = "id, workspace_id, project_id, scene_ids, kind, source, status, title, payload, mime, duration_sec, width, height, file_size, seed, tags, approval, storage_key, error, created_at, updated_at";

function idFrom(request: Request): string {
  return parseId(new URL(request.url).pathname.split("/").pop() ?? "", "asset");
}

async function loadAsset(id: string) {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db.unsafe(`SELECT ${COLS} FROM media_assets WHERE id = $1 LIMIT 1`, [id] as never[]);
  const row = rows[0] as unknown as (Record<string, unknown> & { project_id: string; workspace_id: string; storage_key: string | null }) | undefined;
  if (!row) throw notFound("Asset");
  return { db, row };
}

/** GET /api/v1/assets/[id] — metadata (viewer+ of the project). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const { row } = await loadAsset(id);
    await authorizeResource("projects", String(row.project_id), user, "viewer");
    return NextResponse.json({ data: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  approval: z.enum(["draft", "reviewed", "approved", "used", "rejected"]).optional(),
  scene_ids: z.array(z.string().max(128)).max(200).optional(),
  status: z.enum(["pending", "preparing", "generating", "processing", "ready", "failed", "cancelled"]).optional(),
});

/** PATCH — metadata only, never bytes (editor+). */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const { db, row } = await loadAsset(id);
    const auth = await authorizeResource("projects", String(row.project_id), user, "viewer");
    const membership = await getMembership(auth.workspaceId, user.id);
    if (!membership) throw forbidden();
    assertCanEditProject(membership);
    const body = await parseBody(request, patchSchema);
    if (body.status === "ready" && row.source === "provider-request") {
      throw validationError("Provider requests have no media — they cannot become ready.");
    }
    const cols = Object.keys(body);
    if (cols.length === 0) throw validationError("No writable fields provided.");
    const vals = cols.map((c) => {
      const v = (body as Record<string, unknown>)[c];
      return Array.isArray(v) ? v : v;
    });
    const rows = await db.unsafe(
      `UPDATE media_assets SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING ${COLS}`,
      [...vals, id] as never[],
    );
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "asset.updated", resourceType: "media_assets", resourceId: id });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE — removes row + object bytes (admin+). */
export async function DELETE(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = idFrom(request);
    const { db, row } = await loadAsset(id);
    const auth = await authorizeResource("projects", String(row.project_id), user, "viewer");
    const membership = await getMembership(auth.workspaceId, user.id);
    if (!membership) throw forbidden();
    assertCanDeleteProject(membership);
    await db`DELETE FROM media_assets WHERE id = ${id}`;
    if (row.storage_key) await storageDelete(String(row.storage_key));
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "asset.deleted", resourceType: "media_assets", resourceId: id });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
