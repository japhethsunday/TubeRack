import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeAudio } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { storageGet } from "@/src/server/storage";
import { notFound, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

// Only app file references; the storage key is rebuilt inside the caller's workspace.
const FILE = /^\/api\/v1\/(generated|uploads)\/([0-9a-f-]{36}(?:-output)?\.(?:wav|mp3|ogg|webm|mp4))$/;
const MAX_BYTES = 18 * 1024 * 1024; // Gemini inline request limit headroom

const body = z.object({ file: z.string().regex(FILE, "Choose a stored voice take or uploaded audio file.") });

/** POST /api/v1/ai/transcribe — Gemini turns a stored voice take into timed captions (editor+). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const [, folder, name] = FILE.exec(input.file)!;
    let media;
    try {
      media = await storageGet(`${caller.workspaceId}/${folder}/${name}`);
    } catch {
      throw notFound("Audio file");
    }
    if (media.bytes.byteLength > MAX_BYTES) throw validationError("Audio is over 18 MB — trim the take and try again.");
    const result = await transcribeAudio(media.bytes, media.mime.startsWith("audio/") || media.mime.startsWith("video/") ? media.mime : "audio/wav");
    await recordUsage(caller, { kind: "transcription", provider: "gemini", model: result.model, status: "completed" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "transcription", provider: "gemini", status: "failed" });
    return toErrorResponse(providerFailure(error, "Gemini (GEMINI_API_KEY)"));
  }
}
