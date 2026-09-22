import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource, assertCanEditProject, getMembership } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, validationError, notFound, forbidden } from "@/src/server/errors";
import { parseId, parsePagination, pageResponse } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { validateUpload, readHeader, UPLOAD_LIMITS } from "@/src/lib/media/validation";
import { objectKey, storagePut, inlineLimit } from "@/src/server/storage";

const COLS = "id, workspace_id, project_id, scene_ids, kind, source, status, title, payload, mime, duration_sec, width, height, file_size, seed, tags, approval, storage_key, error, created_at, updated_at";

function projectIdFrom(request: Request): string {
  return parseId(new URL(request.url).searchParams.get("projectId") ?? "", "project");
}

/** GET /api/v1/assets?projectId=&kind=&status= — metadata only, never bytes. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const projectId = projectIdFrom(request);
    await authorizeResource("projects", projectId, user, "viewer");
    const url = new URL(request.url);
    const pagination = parsePagination(url, ["created_at", "updated_at", "title"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const conditions = ["project_id = $1"];
    const values: unknown[] = [projectId];
    for (const [param, column, allowed] of [["kind", "kind", ["image", "video", "voice", "music", "sfx"]], ["status", "status", ["pending", "preparing", "generating", "processing", "ready", "failed", "cancelled"]]] as const) {
      const v = url.searchParams.get(param);
      if (v) {
        if (!(allowed as readonly string[]).includes(v)) throw validationError(`Invalid ${param} filter.`);
        values.push(v);
        conditions.push(`${column} = $${values.length}`);
      }
    }
    const dir = pagination.order === "asc" ? "ASC" : "DESC";
    const sortCol = ["created_at", "updated_at", "title"].includes(pagination.sort ?? "") ? pagination.sort! : "created_at";
    const where = `WHERE ${conditions.join(" AND ")}`;
    const totalRows = await db.unsafe(`SELECT COUNT(*)::int AS count FROM media_assets ${where}`, values as never[]);
    const total = (totalRows[0] as unknown as { count: number }).count;
    const rows = await db.unsafe(
      `SELECT ${COLS} FROM media_assets ${where} ORDER BY ${sortCol} ${dir} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/v1/assets?projectId= — multipart upload with magic-byte validation.
 * Small files inline to the DB when object storage is unreachable; large files
 * require storage (honest 502 otherwise).
 */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("upload").take(`upload:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const projectId = projectIdFrom(request);
    const auth = await authorizeResource("projects", projectId, user, "viewer");
    const membership = await getMembership(auth.workspaceId, user.id);
    if (!membership) throw forbidden();
    assertCanEditProject(membership);

    const form = await request.formData().catch(() => null);
    if (!form) throw validationError("Send multipart form data with a file field.");
    const file = form.get("file");
    const title = String(form.get("title") ?? (file instanceof Blob ? (file as File).name : "upload")).slice(0, 200);
    const sceneIdsRaw = String(form.get("sceneIds") ?? "");
    if (!(file instanceof Blob) || file.size === 0) throw validationError("A non-empty file field is required.");
    if (file.size > 200 * 1024 * 1024) throw validationError("File exceeds the 200 MB maximum.");

    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const found = validateUpload(header, file.size);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");

    const idRows = await db`SELECT gen_random_uuid() AS id`;
    const id = String((idRows[0] as { id: string }).id);
    const key = objectKey(auth.workspaceId, projectId, title, id);
    const bytes = new Uint8Array(await file.arrayBuffer());

    let storageKey: string | null = null;
    let inlineBytes: Uint8Array | null = null;
    try {
      const put = await storagePut(key, bytes, found.mime);
      storageKey = put.key;
    } catch {
      if (bytes.byteLength <= (await inlineLimit())) {
        inlineBytes = bytes;
      } else {
        throw validationError("Object storage is unreachable and the file is too large to inline. Retry later.");
      }
    }

    const sceneIds = sceneIdsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const kind = found.kind === "audio" ? "music" : found.kind;
    const rows = await db.unsafe(
      `INSERT INTO media_assets (id, workspace_id, project_id, scene_ids, kind, source, status, title, payload, mime, file_size, tags, approval, storage_key, inline_bytes)
       VALUES ($1,$2,$3,$4,$5,'upload-session','ready',$6,'',$7,$8,$9,'draft',$10,$11)
       RETURNING ${COLS}`,
      [id, auth.workspaceId, projectId, sceneIds, kind, title.slice(0, 200), found.mime, file.size, ["upload", found.kind], storageKey, inlineBytes] as never[],
    );
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "asset.uploaded", resourceType: "media_assets", resourceId: id, metadata: { kind, bytes: file.size } });
    const row = rows[0] as Record<string, unknown>;
    delete row.inline_bytes;
    return NextResponse.json({ data: { ...row, inline: inlineBytes !== null } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
