import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { getDb } from "@/src/server/db";
import { backendUnavailable, notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const saveBody = z.object({
  name: z.string().trim().min(2).max(80),
  query: z.string().trim().min(2).max(120),
  region: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).default(""),
  category: z.string().trim().max(40).default(""),
  snapshot: z.record(z.string(), z.unknown()).default({}),
  note: z.string().trim().max(1000).default(""),
});

const COLS = "id, name, query, region, category, snapshot, note, created_at";

/** GET /api/v1/market/saved — this workspace's saved niches. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(`SELECT ${COLS} FROM saved_niches WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`, [workspaceId]);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/market/saved — save (or update) a niche with its current scores. */
export async function POST(request: Request) {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    const b = await parseBody(request, saveBody);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(
      `INSERT INTO saved_niches (workspace_id, user_id, name, query, region, category, snapshot, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (workspace_id, query, region) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, snapshot = EXCLUDED.snapshot, note = EXCLUDED.note
       RETURNING ${COLS}`,
      [workspaceId, user.id, b.name, b.query.toLowerCase(), b.region, b.category, b.snapshot as never, b.note],
    );
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/market/saved?id= — remove a saved niche. */
export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`DELETE FROM saved_niches WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id`;
    if (rows.length === 0) throw notFound("Saved niche");
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
