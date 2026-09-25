import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { recreateVideo } from "@/src/server/content/recreate";

export const maxDuration = 120;

const body = z.object({
  video: z.string().trim().min(5).max(300),
  niche: z.string().trim().max(120).default(""),
  audience: z.string().trim().max(200).default(""),
  channelName: z.string().trim().max(120).default(""),
  format: z.enum(["auto", "long", "short"]).default("auto"),
});

/** POST /api/v1/recreate — break down a winning video and write an original blueprint. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    let result;
    try {
      result = await recreateVideo(input);
    } catch (error) {
      if (error instanceof Error && /isn't a YouTube video link|not found or private/.test(error.message)) throw validationError(error.message);
      throw error;
    }
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed" }).catch(() => undefined);
    return toErrorResponse(providerFailure(error, "Video Recreator"));
  }
}
