import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { itemSchema } from "@/src/lib/growth/calendar-schema";

const COLS = "id, project_id, title, kind, to_char(date, 'YYYY-MM-DD') AS date, time, status, notes, remind";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/calendar/:id — partial update (moving a date re-arms its reminder). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { workspaceId, db } = await requireWorkspace("editor");
    const id = (await ctx.params).id;
    const p = await parseBody(request, itemSchema.partial());
    const sets: string[] = [];
    const values: unknown[] = [workspaceId, id];
    const map: Record<string, string> = { title: "title", kind: "kind", date: "date", time: "time", status: "status", notes: "notes", remind: "remind", projectId: "project_id" };
    for (const [k, col] of Object.entries(map)) {
      const v = (p as Record<string, unknown>)[k];
      if (v !== undefined) {
        values.push(v);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (p.date !== undefined) sets.push("reminded_at = NULL");
    sets.push("updated_at = now()");
    const rows = await db.unsafe(`UPDATE calendar_items SET ${sets.join(", ")} WHERE workspace_id = $1 AND id = $2 RETURNING ${COLS}`, values as never[]);
    if (!rows[0]) throw notFound("Calendar item");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { workspaceId, db } = await requireWorkspace("editor");
    await db`DELETE FROM calendar_items WHERE workspace_id = ${workspaceId} AND id = ${(await ctx.params).id}`;
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
