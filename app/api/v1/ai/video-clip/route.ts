import { NextResponse } from "next/server";
import { z } from "zod";
import { sharedLimit } from "@/src/server/shared-limit";
import { guardProviderCall, storeGenerated } from "@/src/server/ai/guard";
import { toErrorResponse, BackendError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { generateFreeVideo, isFreeVideoConfigured } from "@/src/server/ai/free-video";

export const maxDuration = 300;

const body = z.object({
  prompt: z.string().trim().min(3, "Describe the clip.").max(1500),
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Use a PNG, JPG or WebP image.")
    .max(11_000_000, "That image is too large.")
    .optional(),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  seconds: z.number().min(1).max(5).default(3),
});

/** POST /api/v1/ai/video-clip — a short AI clip from a prompt (and optionally a still image). */
export async function POST(request: Request) {
  try {
    const caller = await guardProviderCall();
    if (!isFreeVideoConfigured()) throw new BackendError("BACKEND_UNAVAILABLE", "AI video clips aren't set up yet.");
    // The free GPU allowance is small and shared: keep each user to a few clips a day.
    await sharedLimit(`video-clip:${caller.user.id}`, 5, 86400);
    const input = await parseBody(request, body);
    let image: { bytes: Uint8Array; mime: string } | null = null;
    if (input.image) {
      const [head, b64] = input.image.split(",", 2);
      image = { bytes: new Uint8Array(Buffer.from(b64, "base64")), mime: head.slice(5, head.indexOf(";")) };
    }
    let clip;
    try {
      clip = await generateFreeVideo({ prompt: input.prompt, image, aspect: input.aspect, seconds: input.seconds });
    } catch (error) {
      throw new BackendError("BACKEND_UNAVAILABLE", error instanceof Error ? error.message : "Video generation failed.");
    }
    const url = await storeGenerated(caller, clip.bytes, clip.mime, clip.mime.includes("webm") ? "webm" : "mp4");
    if (!url) throw new BackendError("BACKEND_UNAVAILABLE", "File storage isn't available right now.");
    return NextResponse.json({ data: { url, mime: clip.mime, fileSize: clip.bytes.byteLength, engine: clip.engine } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
