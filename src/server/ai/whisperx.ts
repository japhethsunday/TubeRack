import { getServerEnv } from "@/src/lib/env";
import {
  ProviderNotConfiguredError,
  type TranscriptSegment,
  type TranscriptionProvider,
} from "@/src/lib/ai-gateway/types";

/**
 * WhisperX transcription adapter (BSD-2-Clause service, used over HTTP —
 * no vendored code). Expects a transcription service at WHISPERX_URL
 * exposing POST /transcribe accepting
 *   { "audio_base64": "...", "mime_type": "audio/wav", "language": "en" }
 * and returning
 *   { "text": "...", "language": "en",
 *     "segments": [{ "start": 0.0, "end": 2.5, "text": "..." }] }
 * (see docs/MEDIA_PIPELINE.md for the server contract; faster-whisper and
 * whisper.cpp can sit behind the same TranscriptionProvider shape).
 * Unset URL = explicit boundary error, never a fake transcript.
 */

export interface WhisperXSegment {
  start: number;
  end: number;
  text: string;
}

function toSegment(raw: unknown): TranscriptSegment | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const start = typeof o.start === "number" ? o.start : NaN;
  const end = typeof o.end === "number" ? o.end : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { startSec: start, endSec: end, text: typeof o.text === "string" ? o.text : "" };
}

function stamp(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 1000);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/** SRT for burn-in and downloads (feeds Script → Captions → Timeline). */
export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${stamp(s.startSec)} --> ${stamp(s.endSec)}\n${s.text.trim()}\n`)
    .join("\n");
}

/** WebVTT for browser <track> previews. */
export function toVtt(segments: TranscriptSegment[]): string {
  const lines = segments.map((s) => `${stamp(s.startSec).replace(",", ".")} --> ${stamp(s.endSec).replace(",", ".")}\n${s.text.trim()}\n`);
  return `WEBVTT\n\n${lines.join("\n")}`;
}

export class WhisperXTranscriptionProvider implements TranscriptionProvider {
  readonly capability = "transcription" as const;
  readonly name = "whisperx";

  async transcribe(request: {
    audioBase64: string;
    mimeType?: string;
    language?: string;
  }): Promise<{ text: string; segments: TranscriptSegment[]; language?: string; model: string }> {
    if (!request.audioBase64) throw new Error("WhisperX transcription failed: audio is empty.");
    const env = getServerEnv();
    const base = (env.WHISPERX_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("transcription", "Set WHISPERX_URL to enable transcription.");
    let response: Response;
    try {
      response = await fetch(`${base}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          audio_base64: request.audioBase64,
          mime_type: request.mimeType ?? "audio/wav",
          language: request.language ?? "en",
        }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
    } catch {
      throw new Error("WhisperX transcription failed: service unreachable.");
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error(`WhisperX transcription failed: unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(`WhisperX transcription failed (${response.status}).`);
    const segments = Array.isArray(payload.segments)
      ? (payload.segments.map(toSegment).filter((s): s is TranscriptSegment => s !== null).slice(0, 5000))
      : [];
    const text = typeof payload.text === "string" && payload.text ? payload.text : segments.map((s) => s.text).join(" ").trim();
    if (!text) throw new Error("WhisperX transcription failed: empty transcript.");
    return {
      text,
      segments,
      language: typeof payload.language === "string" ? payload.language : request.language,
      model: "whisperx",
    };
  }
}
