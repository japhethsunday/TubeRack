import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { applyVariant, deleteTest, getTest, refreshResults, rotateTest, startTest, stopTest } from "@/src/server/growth/abtests";
import { scoreThumbnails } from "@/src/server/ai/gemini";
import { storageGet } from "@/src/server/storage";
import { getDb } from "@/src/server/db";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await getTest(workspaceId, (await ctx.params).id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    await deleteTest(workspaceId, (await ctx.params).id);
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const action = z.object({
  action: z.enum(["start", "rotate", "stop", "refresh", "apply", "score"]),
  variantId: z.string().optional(),
});

/** POST /api/v1/abtests/:id { action } — start, rotate now, stop, refresh results, apply a variant, or AI-score. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const id = (await ctx.params).id;
    const input = await parseBody(request, action);
    switch (input.action) {
      case "start":
        return NextResponse.json({ data: await startTest(workspaceId, id) });
      case "rotate": {
        const test = await getTest(workspaceId, id);
        if (test.status !== "running") throw validationError("Only running tests can rotate.");
        return NextResponse.json({ data: await rotateTest(workspaceId, test) });
      }
      case "stop":
        return NextResponse.json({ data: await stopTest(workspaceId, id) });
      case "refresh":
        return NextResponse.json({ data: await refreshResults(workspaceId, id) });
      case "apply":
        if (!input.variantId) throw validationError("Missing variantId.");
        await applyVariant(workspaceId, id, input.variantId);
        return NextResponse.json({ data: await getTest(workspaceId, id) });
      case "score": {
        const test = await getTest(workspaceId, id);
        const images = await Promise.all(test.variants.map(async (v) => {
          const { bytes, mime } = await storageGet(v.storageKey);
          return { mime: mime || v.mime, base64: Buffer.from(bytes).toString("base64") };
        }));
        const review = await scoreThumbnails(test.video_title, images);
        const scored = { ...review, scores: review.scores.map((s) => ({ ...s, variantId: test.variants[s.index]?.id })), pickVariantId: test.variants[review.pick]?.id ?? null };
        const db = getDb();
        await db?.unsafe(`UPDATE thumb_tests SET ai_scores = $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(scored)]);
        return NextResponse.json({ data: await getTest(workspaceId, id) });
      }
    }
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
