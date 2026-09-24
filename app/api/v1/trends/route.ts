import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { addWatch, listWatches, removeWatch, updateWatch } from "@/src/server/growth/trends";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

/** GET /api/v1/trends — watched topics with their latest results. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await listWatches(workspaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/trends { query, region, emailDigest } — watch a topic. */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const input = await parseBody(
      request,
      z.object({
        query: z.string().trim().min(2).max(120),
        region: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).default(""),
        emailDigest: z.boolean().default(true),
      }),
    );
    return NextResponse.json({ data: await addWatch(caller.workspaceId, caller.user.id, input) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/v1/trends { id, emailDigest } — toggle the daily email. */
export async function PATCH(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const input = await parseBody(request, z.object({ id: z.string().min(1), emailDigest: z.boolean() }));
    await updateWatch(workspaceId, input.id, input.emailDigest);
    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/trends?id= — stop watching. */
export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) throw validationError("Missing id.");
    await removeWatch(workspaceId, id);
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
