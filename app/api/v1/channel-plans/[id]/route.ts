import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { backendUnavailable, notFound, toErrorResponse } from "@/src/server/errors";

const COLS = "id, niche, region, inputs, plan, evidence, model, applied, created_at, updated_at";

/** GET /api/v1/channel-plans/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const { id } = await params;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(`SELECT ${COLS} FROM channel_plans WHERE id = $1 AND workspace_id = $2`, [id, workspaceId]);
    if (!rows[0]) throw notFound("Channel plan");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/channel-plans/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const { id } = await params;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`DELETE FROM channel_plans WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id`;
    if (!rows[0]) throw notFound("Channel plan");
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
