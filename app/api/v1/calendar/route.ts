import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { itemSchema } from "@/src/lib/growth/calendar-schema";

const COLS = "id, project_id, title, kind, to_char(date, 'YYYY-MM-DD') AS date, time, status, notes, remind";
const ymd = /^\d{4}-\d{2}-\d{2}$/;


/** GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: Request) {
  try {
    const { workspaceId, db } = await requireWorkspace("viewer");
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!ymd.test(from) || !ymd.test(to)) throw validationError("from and to must be YYYY-MM-DD.");
    const rows = await db.unsafe(`SELECT ${COLS} FROM calendar_items WHERE workspace_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, time, created_at`, [workspaceId, from, to]);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/calendar — add an item. */
export async function POST(request: Request) {
  try {
    const { workspaceId, user, db } = await requireWorkspace("editor");
    const i = await parseBody(request, itemSchema);
    const rows = await db.unsafe(
      `INSERT INTO calendar_items (workspace_id, user_id, project_id, title, kind, date, time, status, notes, remind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLS}`,
      [workspaceId, user.id, i.projectId, i.title, i.kind, i.date, i.time, i.status, i.notes, i.remind],
    );
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
