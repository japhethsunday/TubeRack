import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiImageProvider } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, storeGenerated, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const body = z.object({
  prompt: z.string().trim().min(1, "Prompt is required.").max(2000),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
});

/** POST /api/v1/ai/image — generate one image with Gemini (editor+). Returns a stored-file URL (data URL if storage is off). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const result = await new GeminiImageProvider().generateImage(input);
    // Store bytes in the bucket; the client keeps only a short URL.
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(result.url);
    if (match) {
      const ext = match[1] === "image/jpeg" ? "jpg" : match[1] === "image/webp" ? "webp" : "png";
      const stored = await storeGenerated(caller, Buffer.from(match[2], "base64"), match[1], ext).catch(() => null);
      if (stored) result.url = stored;
    }
    await recordUsage(caller, { kind: "image", provider: "gemini", status: "completed" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "image", provider: "gemini", status: "failed" });
    return toErrorResponse(providerFailure(error, "The generation service"));
  }
}
