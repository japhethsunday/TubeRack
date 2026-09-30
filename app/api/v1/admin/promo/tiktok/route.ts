import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { defaultWorkspace } from "@/src/server/sync";
import { getTikTokConnection } from "@/src/server/tiktok/client";
import { runDuePosts, scheduleTikTok } from "@/src/server/tiktok/schedule";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  fileUrl: z.string().max(200).regex(/^\/api\/v1\/uploads\//),
  caption: z.string().max(2200).default(""),
  /** ISO time; empty or past means post now. */
  postAt: z.string().max(40).default(""),
  projectId: z.string().max(80).optional(),
  promoId: z.string().max(80).optional(),
});

/** POST /api/v1/admin/promo/tiktok — queue a finished promo video for TikTok at a set time. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "promo.write");
    const input = await parseBody(request, body);
    const workspaceId = await defaultWorkspace(admin);
    if (!(await getTikTokConnection(workspaceId))) throw validationError("TikTok isn't connected. Connect it on the YouTube page first.");
    const at = input.postAt ? new Date(input.postAt) : new Date();
    const out = await scheduleTikTok({ workspaceId, userId: admin.id, fileUrl: input.fileUrl, caption: input.caption, postAt: at, projectId: input.projectId, promoId: input.promoId });
    // Due now: post straight away instead of waiting for the next run.
    if (new Date(out.postAt).getTime() <= Date.now() + 60_000) await runDuePosts(1);
    return NextResponse.json({ data: out });
  } catch (error) {
    return toErrorResponse(error);
  }
}
