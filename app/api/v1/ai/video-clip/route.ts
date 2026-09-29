import { NextResponse } from "next/server";
import { z } from "zod";
import { sharedLimit } from "@/src/server/shared-limit";
import { guardProviderCall, recordUsage, storeGenerated } from "@/src/server/ai/guard";
import { assertCredits, creditState, isPaidPlan } from "@/src/server/credits";
import { isAdmin } from "@/src/server/admin";
import { toErrorResponse, BackendError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { screenPrompt } from "@/src/server/safety";
import { isFreeVideoConfigured } from "@/src/server/ai/free-video";
import { generateVideoClip } from "@/src/server/ai/video-gen";

export const maxDuration = 300;

const body = z.object({
  prompt: z.string().trim().min(3, "Describe the clip.").max(1500),
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Use a PNG, JPG or WebP image.")
    .max(11_000_000, "That image is too large.")
    .optional(),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  seconds: z.number().min(1).max(5).default(5),
});

/** POST /api/v1/ai/video-clip — a short AI clip from a prompt (and optionally a still image). */
export async function POST(request: Request) {
  try {
    const caller = await guardProviderCall("video");
    if (!isAdmin(caller.user) && !isPaidPlan(await creditState(caller.workspaceId))) {
      throw new BackendError("FORBIDDEN", "AI video clips are part of the paid plans. Upgrade to use them.");
    }
    if (!isFreeVideoConfigured()) throw new BackendError("BACKEND_UNAVAILABLE", "AI video clips aren't set up yet.");
    // A video pass never covers clips: each one is charged.
    caller.covered = false;
    await sharedLimit(`video-clip:${caller.user.id}`, 20, 86400);
    await assertCredits(caller.workspaceId, "video");
    const input = await parseBody(request, body);
    await screenPrompt(caller.user, input.prompt);
    let image: { bytes: Uint8Array; mime: string } | null = null;
    if (input.image) {
      const [head, b64] = input.image.split(",", 2);
      image = { bytes: new Uint8Array(Buffer.from(b64, "base64")), mime: head.slice(5, head.indexOf(";")) };
    }
    let clip;
    try {
      clip = await generateVideoClip({ prompt: input.prompt, image, aspect: input.aspect, seconds: input.seconds });
    } catch (error) {
      throw new BackendError("BACKEND_UNAVAILABLE", error instanceof Error ? error.message : "Video generation failed.");
    }
    const url = await storeGenerated(caller, clip.bytes, clip.mime, clip.mime.includes("webm") ? "webm" : "mp4");
    if (!url) throw new BackendError("BACKEND_UNAVAILABLE", "File storage isn't available right now.");
    await recordUsage(caller, { kind: "video", provider: clip.engine === "seedance" ? "byteplus" : "free-video", status: "completed" });
    return NextResponse.json({ data: { url, mime: clip.mime, fileSize: clip.bytes.byteLength, seconds: clip.seconds } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
