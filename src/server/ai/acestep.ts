import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError, type MusicProvider } from "@/src/lib/ai-gateway/types";

/**
 * ACE-Step music adapter (Apache-2.0) over HTTP. Expects ACE_STEP_URL
 * exposing POST /compose accepting
 *   { "prompt": "ambient forest pads", "duration_sec": 30 }
 * and returning { "audio_base64": "...", "mime_type": "audio/wav" }.
 * GPU required for practical use. Unset URL = boundary error.
 */
export class AceStepMusicProvider implements MusicProvider {
  readonly capability = "music" as const;
  readonly name = "ace-step";

  async composeMusic(request: {
    prompt: string;
    durationSec?: number;
  }): Promise<{ audioBase64: string; mimeType: string; model: string }> {
    const prompt = request.prompt.trim();
    if (!prompt) throw new Error("ACE-Step composition failed: prompt cannot be empty.");
    const durationSec =
      typeof request.durationSec === "number" && Number.isFinite(request.durationSec)
        ? Math.min(300, Math.max(5, Math.floor(request.durationSec)))
        : 30;
    const env = getServerEnv();
    const base = (env.ACE_STEP_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("music", "Set ACE_STEP_URL to enable AI music generation.");
    let response: Response;
    try {
      response = await fetch(`${base}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ prompt, duration_sec: durationSec }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
    } catch {
      throw new Error("ACE-Step composition failed: service unreachable.");
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error(`ACE-Step composition failed: unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(`ACE-Step composition failed (${response.status}).`);
    if (typeof payload.audio_base64 !== "string" || !payload.audio_base64) {
      throw new Error("ACE-Step composition failed: empty audio.");
    }
    return {
      audioBase64: payload.audio_base64,
      mimeType: typeof payload.mime_type === "string" ? payload.mime_type : "audio/wav",
      model: "ace-step",
    };
  }
}
