import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const COLS = "id, project_id, video_id, title, privacy, publish_at, status, steps, error, created_at, updated_at";

/** GET /api/v1/youtube/publishes?projectId= — publish history for a project. */
export async function GET(request: Request) {
  try {
    const { workspaceId, db } = await requireWorkspace("viewer");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
    if (!projectId) throw validationError("Missing projectId.");
    const rows = await db.unsafe(`SELECT ${COLS} FROM youtube_publishes WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 20`, [workspaceId, projectId]);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  id: z.string().max(64).optional(),
  projectId: z.string().min(1).max(100),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable().default(null),
  title: z.string().max(200).default(""),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
  publishAt: z.string().datetime().nullable().default(null),
  status: z.enum(["uploading", "processing", "published", "scheduled", "failed"]),
  steps: z.record(z.string(), z.string().max(300)).default({}),
  error: z.string().max(500).nullable().default(null),
});

/** POST /api/v1/youtube/publishes — create or update a publish record (upsert by id). */
export async function POST(request: Request) {
  try {
    const { workspaceId, user, db } = await requireWorkspace("editor");
    const i = await parseBody(request, body);
    const values = [i.projectId, i.videoId, i.title, i.privacy, i.publishAt, i.status, JSON.stringify(i.steps), i.error];
    const rows = i.id
      ? await db.unsafe(
          `UPDATE youtube_publishes SET project_id=$3, video_id=$4, title=$5, privacy=$6, publish_at=$7, status=$8, steps=$9::jsonb, error=$10, updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING ${COLS}`,
          [workspaceId, i.id, ...values] as never[],
        )
      : await db.unsafe(
          `INSERT INTO youtube_publishes (workspace_id, user_id, project_id, video_id, title, privacy, publish_at, status, steps, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING ${COLS}`,
          [workspaceId, user.id, ...values] as never[],
        );
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
