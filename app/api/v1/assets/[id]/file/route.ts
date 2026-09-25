import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, notFound } from "@/src/server/errors";
import { parseId } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { storageGet } from "@/src/server/storage";

/**
 * GET /api/v1/assets/[id]/file — bytes with ownership check.
 * Inline BYTEA first, object storage second. Content served with the stored
 * MIME type; filenames are sanitized (no path traversal possible).
 */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = parseId(new URL(request.url).pathname.split("/").slice(-2)[0] ?? "", "asset");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      SELECT project_id, mime, title, storage_key, inline_bytes, file_size
      FROM media_assets WHERE id = ${id} LIMIT 1
    `;
    const row = rows[0] as unknown as { project_id: string; mime: string; title: string; storage_key: string | null; inline_bytes: Uint8Array | null; file_size: number | null } | undefined;
    if (!row) throw notFound("Asset");
    await authorizeResource("projects", row.project_id, user, "viewer");

    if (row.inline_bytes) {
      const bytes = row.inline_bytes as unknown as Uint8Array;
      return new NextResponse(bytes as unknown as BodyInit, {
        headers: {
          "Content-Type": row.mime || "application/octet-stream",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `inline; filename="${encodeURIComponent(row.title).slice(0, 120)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    if (!row.storage_key) throw notFound("Asset file");
    const { bytes, mime } = await storageGet(row.storage_key);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.title).slice(0, 120)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
