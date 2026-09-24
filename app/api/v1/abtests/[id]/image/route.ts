import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { getTest } from "@/src/server/growth/abtests";
import { storageSignedUrl } from "@/src/server/storage";
import { notFound, toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/abtests/:id/image?variant= — 302 to a short-lived signed URL. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const test = await getTest(workspaceId, (await ctx.params).id);
    const v = test.variants.find((x) => x.id === new URL(request.url).searchParams.get("variant"));
    if (!v) throw notFound("Variant");
    return NextResponse.redirect(await storageSignedUrl(v.storageKey, 600), 302);
  } catch (error) {
    return toErrorResponse(error);
  }
}
