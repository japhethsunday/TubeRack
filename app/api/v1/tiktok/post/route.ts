import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { postToTikTok } from "@/src/server/tiktok/post";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const body = z.object({
  fileUrl: z.string().max(200),
  mode: z.enum(["direct", "draft"]),
  caption: z.string().max(2200).default(""),
  privacy: z.string().max(40).default(""),
  disableComment: z.boolean().default(false),
  disableDuet: z.boolean().default(false),
  disableStitch: z.boolean().default(false),
  brandOrganic: z.boolean().default(false),
  brandContent: z.boolean().default(false),
  isAigc: z.boolean().default(true),
  projectId: z.string().max(80).optional(),
});

/** POST /api/v1/tiktok/post — send an uploaded video to the connected TikTok account. */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const input = await parseBody(request, body);
    const out = await postToTikTok(caller.workspaceId, caller.user.id, input);
    await audit({ workspaceId: caller.workspaceId, userId: caller.user.id, action: "tiktok.post_started", resourceType: "tiktok_post", resourceId: out.id, metadata: { mode: input.mode } }).catch(() => undefined);
    return NextResponse.json({ data: out });
  } catch (error) {
    return toErrorResponse(error);
  }
}
