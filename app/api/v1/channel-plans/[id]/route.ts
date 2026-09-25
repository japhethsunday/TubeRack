import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { z } from "zod";
import { backendUnavailable, notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

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

const patch = z.object({ chosenName: z.string().trim().min(1, "Enter a channel name.").max(60) });

/** PATCH /api/v1/channel-plans/:id — confirm the channel name used for this plan's videos. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const { id } = await params;
    const { chosenName } = await parseBody(request, patch);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const found = await db.unsafe(`SELECT plan FROM channel_plans WHERE id = $1 AND workspace_id = $2`, [id, workspaceId]);
    if (!found[0]) throw notFound("Channel plan");
    // The written copy (about, tagline) mentions the name it was written for: swap it in.
    const plan = { ...(found[0].plan as Record<string, unknown>) };
    const names = Array.isArray(plan.names) ? (plan.names as { name?: string }[]) : [];
    const previous = (typeof plan.chosenName === "string" && plan.chosenName) || names[0]?.name || "";
    if (previous && previous !== chosenName) {
      const swap = (v: unknown) => (typeof v === "string" ? v.split(previous).join(chosenName) : v);
      plan.about = swap(plan.about);
      plan.tagline = swap(plan.tagline);
      plan.positioning = swap(plan.positioning);
    }
    plan.chosenName = chosenName;
    const rows = await db.unsafe(`UPDATE channel_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2 AND workspace_id = $3 RETURNING ${COLS}`, [
      JSON.stringify(plan),
      id,
      workspaceId,
    ]);
    if (!rows[0]) throw notFound("Channel plan");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
