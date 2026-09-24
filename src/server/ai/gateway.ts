import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import type {
  ImageProvider,
  MusicProvider,
  RenderingProvider,
  TranscriptionProvider,
  TtsProvider,
} from "@/src/lib/ai-gateway/types";
import { GeminiImageProvider, GeminiTtsProvider, isGeminiConfigured } from "@/src/server/ai/gemini";
import { ComfyUIImageProvider } from "@/src/server/ai/comfyui";
import { PiperTtsProvider } from "@/src/server/ai/piper";
import { AceStepMusicProvider } from "@/src/server/ai/acestep";
import { WhisperXTranscriptionProvider } from "@/src/server/ai/whisperx";
import { ExternalRenderingProvider } from "@/src/server/ai/rendiv";

/**
 * AI gateway routing: UI → route → gateway → provider adapter.
 * Routes never import a vendor adapter directly; they ask the gateway for
 * a capability (optionally naming a provider) and get the first configured
 * adapter. Nothing here fakes output — unconfigured means the boundary error.
 */

const set = (v: string | undefined) => Boolean((v ?? "").trim());

export type ImageProviderName = "gemini" | "comfyui";
export type TtsProviderName = "gemini" | "piper";

interface Candidate<T> {
  name: string;
  configured: () => boolean;
  make: () => T;
}

function pick<T>(capability: string, candidates: Candidate<T>[], requested?: string): { name: string; provider: T } {
  const env = getServerEnv();
  void env;
  if (requested) {
    const c = candidates.find((x) => x.name === requested);
    if (!c) throw new ProviderNotConfiguredError(capability as never, `Unknown ${capability} provider "${requested}".`);
    if (!c.configured()) throw new ProviderNotConfiguredError(capability as never, `${requested} is not configured.`);
    return { name: c.name, provider: c.make() };
  }
  const c = candidates.find((x) => x.configured());
  if (!c) throw new ProviderNotConfiguredError(capability as never);
  return { name: c.name, provider: c.make() };
}

const IMAGE: Candidate<ImageProvider>[] = [
  { name: "gemini", configured: () => isGeminiConfigured(), make: () => new GeminiImageProvider() },
  {
    name: "comfyui",
    configured: () => set(getServerEnv().COMFYUI_URL) && set(getServerEnv().COMFYUI_WORKFLOW),
    make: () => new ComfyUIImageProvider(),
  },
];
const TTS: Candidate<TtsProvider>[] = [
  { name: "gemini", configured: () => isGeminiConfigured(), make: () => new GeminiTtsProvider() },
  { name: "piper", configured: () => set(getServerEnv().PIPER_URL), make: () => new PiperTtsProvider() },
];
const MUSIC: Candidate<MusicProvider>[] = [
  { name: "ace-step", configured: () => set(getServerEnv().ACE_STEP_URL), make: () => new AceStepMusicProvider() },
];
const TRANSCRIPTION: Candidate<TranscriptionProvider>[] = [
  { name: "whisperx", configured: () => set(getServerEnv().WHISPERX_URL), make: () => new WhisperXTranscriptionProvider() },
];
const RENDER: Candidate<RenderingProvider & { renderStatus?: (id: string) => Promise<{ status: string; url?: string }> }>[] = [
  { name: "rendiv", configured: () => set(getServerEnv().RENDIV_URL), make: () => new ExternalRenderingProvider() },
];

export const gateway = {
  image: (requested?: string) => pick("image", IMAGE, requested),
  tts: (requested?: string) => pick("tts", TTS, requested),
  music: (requested?: string) => pick("music", MUSIC, requested),
  transcription: (requested?: string) => pick("transcription", TRANSCRIPTION, requested),
  render: (requested?: string) => pick("video", RENDER, requested),
  /** Configured provider names per capability (for UI gating). */
  available(): Record<"image" | "tts" | "music" | "transcription" | "render", string[]> {
    const names = <T>(list: Candidate<T>[]) => list.filter((c) => c.configured()).map((c) => c.name);
    return {
      image: names(IMAGE),
      tts: names(TTS),
      music: names(MUSIC),
      transcription: names(TRANSCRIPTION),
      render: names(RENDER),
    };
  },
};

/** Which providers run long enough that they must go through the job worker. */
export const SELF_HOSTED = new Set(["comfyui", "piper", "ace-step", "whisperx", "rendiv"]);

export type HealthState = "healthy" | "unreachable" | "not-configured" | "configured";

/**
 * Health probe for self-hosted services: any HTTP answer below 500 within
 * 3s counts as reachable. Cloud APIs (Gemini, YouTube) report "configured"
 * without a call so health checks never spend quota.
 */
export async function probeHealth(url: string | undefined): Promise<HealthState> {
  const base = (url ?? "").trim().replace(/\/+$/, "");
  if (!base) return "not-configured";
  try {
    const response = await fetch(`${base}/`, { method: "GET", signal: AbortSignal.timeout(3000) });
    return response.status < 500 ? "healthy" : "unreachable";
  } catch {
    return "unreachable";
  }
}
