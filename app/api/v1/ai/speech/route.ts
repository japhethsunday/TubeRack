import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiTtsProvider } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, storeGenerated, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  text: z.string().trim().min(1, "Text is required.").max(5000),
  voice: z.string().trim().max(40).optional(),
});

/** POST /api/v1/ai/speech — synthesize narration with Gemini TTS (editor+). Returns a stored-file URL for the WAV. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const result = await new GeminiTtsProvider().synthesizeSpeech(input);
    const ext = result.mimeType === "audio/mpeg" ? "mp3" : "wav";
    const stored = await storeGenerated(caller, Buffer.from(result.audioBase64, "base64"), result.mimeType, ext).catch(() => null);
    await recordUsage(caller, { kind: "tts", provider: "gemini", model: result.model, status: "completed" });
    const url = stored ?? `data:${result.mimeType};base64,${result.audioBase64}`;
    return NextResponse.json({ data: { url, mimeType: result.mimeType, model: result.model } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "tts", provider: "gemini", status: "failed" });
    return toErrorResponse(providerFailure(error, "Gemini (GEMINI_API_KEY)"));
  }
}
