import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";

/**
 * Mistral (console.mistral.ai): text models plus Voxtral speech and
 * transcription, used as backups when Gemini is busy or unavailable.
 * The key never leaves the server.
 */
const BASE_URL = "https://api.mistral.ai/v1";
// Large is used when the plan includes it; models missing from the account's list are skipped.
export const MISTRAL_TEXT_MODELS = [
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-small-latest",
  "magistral-medium-latest",
  "ministral-14b-latest",
  "ministral-8b-latest",
];
const TTS_MODEL = "voxtral-mini-tts-2603";
const STT_MODEL = "voxtral-mini-latest";
const DEFAULT_VOICE = "en_paul_neutral";

export function isMistralConfigured(env = getServerEnv()): boolean {
  return Boolean(env.MISTRAL_API_KEY);
}

function key(env = getServerEnv()): string {
  if (!env.MISTRAL_API_KEY) throw new Error("Mistral is not configured.");
  return env.MISTRAL_API_KEY;
}

function textProvider(env = getServerEnv()): ChatProvider {
  const custom = env.MISTRAL_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return { name: "Mistral", baseUrl: BASE_URL, key: key(env), models: custom?.length ? custom : MISTRAL_TEXT_MODELS };
}

export function mistralGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(textProvider(), request, opts);
}

/** Pull 16-bit PCM and its sample rate out of a WAV file. */
export function wavToPcm(wav: Buffer): { pcm: Buffer; rate: number } {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let rate = 24000;
  let channels = 1;
  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = wav.readUInt16LE(off + 10);
      rate = wav.readUInt32LE(off + 12);
      if (wav.readUInt16LE(off + 22) !== 16) throw new Error("unsupported WAV bit depth");
    } else if (id === "data") {
      let pcm = wav.subarray(off + 8, Math.min(wav.length, off + 8 + size));
      if (channels === 2) {
        // Down-mix to mono so chunks can be joined with the rest of the take.
        const mono = Buffer.alloc(Math.floor(pcm.length / 4) * 2);
        for (let i = 0, j = 0; i + 3 < pcm.length; i += 4, j += 2) mono.writeInt16LE((pcm.readInt16LE(i) + pcm.readInt16LE(i + 2)) >> 1, j);
        pcm = mono;
      }
      return { pcm: Buffer.from(pcm), rate };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no audio data");
}

/** Voxtral text-to-speech for one chunk of narration; returns mono 16-bit PCM. */
export async function mistralSpeechChunk(text: string): Promise<{ pcm: Buffer; rate: number }> {
  const env = getServerEnv();
  const res = await fetch(`${BASE_URL}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, input: text, voice_id: env.MISTRAL_TTS_VOICE || DEFAULT_VOICE, response_format: "wav" }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Mistral speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const type = res.headers.get("content-type") ?? "";
  const bytes = type.includes("json")
    ? Buffer.from(String(((await res.json()) as { audio_data?: string }).audio_data ?? ""), "base64")
    : Buffer.from(await res.arrayBuffer());
  if (bytes.length < 44) throw new Error("Mistral speech returned no audio");
  return wavToPcm(bytes);
}

export interface MistralSegment {
  startSec: number;
  endSec: number;
  text: string;
}

/** Break long transcript segments into caption-sized lines (~8 words), timing spread by word count. */
export function toCaptionLines(segments: MistralSegment[], maxWords = 8): MistralSegment[] {
  const out: MistralSegment[] = [];
  for (const s of segments) {
    const words = s.text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      if (words.length) out.push({ ...s, text: words.join(" ") });
      continue;
    }
    const per = (s.endSec - s.startSec) / words.length;
    for (let i = 0; i < words.length; i += maxWords) {
      const n = Math.min(maxWords, words.length - i);
      out.push({ startSec: s.startSec + i * per, endSec: s.startSec + (i + n) * per, text: words.slice(i, i + n).join(" ") });
    }
  }
  return out;
}

/** Voxtral transcription with segment timestamps, split into caption lines. */
export async function mistralTranscribe(bytes: Uint8Array, mimeType: string): Promise<{ text: string; segments: MistralSegment[]; model: string }> {
  const form = new FormData();
  const ext = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "wav";
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `audio.${ext}`);
  form.append("model", STT_MODEL);
  form.append("timestamp_granularities", "segment");
  const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Mistral transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { text?: string; segments?: { start?: number; end?: number; text?: string }[] };
  const segments = toCaptionLines(
    (body.segments ?? [])
      .map((s) => ({ startSec: Number(s.start), endSec: Number(s.end), text: String(s.text ?? "").trim() }))
      .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec && s.text),
  );
  if (segments.length === 0) throw new Error("Mistral transcription returned no timed segments");
  return { text: body.text?.trim() || segments.map((s) => s.text).join(" "), segments, model: STT_MODEL };
}
