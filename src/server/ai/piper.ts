import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError, type TtsProvider } from "@/src/lib/ai-gateway/types";

/**
 * Piper TTS sidecar adapter (Piper engine is GPL-3.0; it runs as a
 * separate process over HTTP, so nothing is linked into TubeRack).
 * Expects PIPER_URL exposing POST /synthesize accepting
 *   { "text": "...", "voice": "en_US-lessac-medium" }
 * and returning { "audio_base64": "...", "mime_type": "audio/wav" }.
 * Voice models carry their own licenses — verify per voice before
 * shipping it (see docs/MEDIA_PIPELINE.md). Unset URL = boundary error.
 */
export class PiperTtsProvider implements TtsProvider {
  readonly capability = "tts" as const;
  readonly name = "piper";

  async synthesizeSpeech(request: {
    text: string;
    voice?: string;
  }): Promise<{ audioBase64: string; mimeType: string; model: string }> {
    const text = request.text.trim();
    if (!text) throw new Error("Piper synthesis failed: text cannot be empty.");
    if (text.length > 5000) throw new Error("Piper synthesis failed: text exceeds 5000 characters.");
    const env = getServerEnv();
    const base = (env.PIPER_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("tts", "Set PIPER_URL to enable local TTS.");
    const voice = request.voice?.trim() || env.PIPER_VOICE || "en_US-lessac-medium";
    let response: Response;
    try {
      response = await fetch(`${base}/synthesize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(env.PIPER_TOKEN ? { Authorization: `Bearer ${env.PIPER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ text, voice }),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
    } catch {
      throw new Error("Piper synthesis failed: service unreachable.");
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error(`Piper synthesis failed: unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(`Piper synthesis failed (${response.status}).`);
    if (typeof payload.audio_base64 !== "string" || !payload.audio_base64) {
      throw new Error("Piper synthesis failed: empty audio.");
    }
    return {
      audioBase64: payload.audio_base64,
      mimeType: typeof payload.mime_type === "string" ? payload.mime_type : "audio/wav",
      model: `piper/${voice}`,
    };
  }
}
