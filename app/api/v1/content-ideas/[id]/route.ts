import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { backendUnavailable, notFound, toErrorResponse } from "@/src/server/errors";

/** DELETE /api/v1/content-ideas/:id — remove a saved idea set. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const { id } = await params;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`DELETE FROM content_idea_sets WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id`;
    if (!rows[0]) throw notFound("Idea set");
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
