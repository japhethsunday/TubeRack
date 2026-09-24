import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { createUploadSession } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { linkOrigin } from "@/src/server/email";
import { audit } from "@/src/server/audit";

const body = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  tags: z.array(z.string().trim().min(1).max(100)).max(40).default([]),
  categoryId: z.string().regex(/^\d{1,3}$/).default("22"),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
  publishAt: z.string().datetime().nullable().default(null),
  madeForKids: z.boolean().default(false),
  size: z.number().int().positive().max(256 * 1024 ** 3),
  mime: z.string().regex(/^video\//, "Choose a video file."),
  defaultLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/).optional(),
  containsSyntheticMedia: z.boolean().optional(),
  notifySubscribers: z.boolean().optional(),
  embeddable: z.boolean().optional(),
  license: z.enum(["youtube", "creativeCommon"]).optional(),
});

/**
 * POST /api/v1/youtube/upload — open a resumable upload on the connected
 * channel. Returns the session URL the browser uploads the file to.
 * publishAt schedules the video (it stays private until then).
 */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const input = await parseBody(request, body);
    if (input.publishAt && new Date(input.publishAt).getTime() < Date.now() + 15 * 60_000) {
      throw validationError("Schedule at least 15 minutes in the future.");
    }
    const uploadUrl = await createUploadSession(caller.workspaceId, linkOrigin(request), input);
    await audit({ workspaceId: caller.workspaceId, userId: caller.user.id, action: "youtube.upload_started", resourceType: "youtube_video", metadata: { title: input.title, scheduled: Boolean(input.publishAt) } });
    return NextResponse.json({ data: { uploadUrl } });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube upload"));
  }
}
