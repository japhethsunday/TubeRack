import { getServerEnv } from "@/src/lib/env";
import { isGeminiConfigured, getGeminiModels } from "@/src/server/ai/gemini";
import { isYouTubeConfigured } from "@/src/server/youtube/client";
import { ffmpegStatus } from "@/src/server/media/ffmpeg";

/**
 * Provider registry: what the app knows about every generation/rendering
 * provider — name, type, capabilities, models, locality, GPU needs, and
 * configuration status. Presence only: no secrets, keys, or URLs ever
 * leave the server through this descriptor. The UI reads
 * GET /api/v1/system/providers and must never show generation as
 * available when `configured` is false.
 */

export interface ProviderDescriptor {
  provider: string;
  type: string;
  capabilities: string[];
  models: string[];
  local: boolean;
  gpuRequired: boolean;
  configured: boolean;
  detail: string;
  /** Present when the caller asked for live health (see withHealth). */
  health?: "healthy" | "unreachable" | "not-configured" | "configured";
}

export function describeProviders(): ProviderDescriptor[] {
  const env = getServerEnv();
  const gemini = getGeminiModels(env);
  const url = (v: string | undefined) => Boolean((v ?? "").trim());
  return [
    {
      provider: "gemini",
      type: "cloud",
      capabilities: ["text", "intelligence", "image", "tts"],
      models: [gemini.text, gemini.image, gemini.tts],
      local: false,
      gpuRequired: false,
      configured: isGeminiConfigured(env),
      detail: isGeminiConfigured(env) ? "GEMINI_API_KEY is set." : "Set GEMINI_API_KEY to enable.",
    },
    {
      provider: "youtube",
      type: "cloud",
      capabilities: ["ingestion", "research"],
      models: ["youtube-data-api-v3", "oembed"],
      local: false,
      gpuRequired: false,
      configured: isYouTubeConfigured(env),
      detail: isYouTubeConfigured(env)
        ? "YOUTUBE_API_KEY is set (oEmbed fallback always available)."
        : "Keyless oEmbed fallback available; set YOUTUBE_API_KEY for metrics.",
    },
    {
      provider: "whisperx",
      type: "self-hosted",
      capabilities: ["transcription"],
      models: ["whisperx"],
      local: true,
      gpuRequired: true,
      configured: url(env.WHISPERX_URL),
      detail: url(env.WHISPERX_URL) ? "WHISPERX_URL is set." : "Set WHISPERX_URL to a transcription service.",
    },
    {
      provider: "piper",
      type: "self-hosted",
      capabilities: ["tts"],
      models: [env.PIPER_VOICE || "en_US-lessac-medium"],
      local: true,
      gpuRequired: false,
      configured: url(env.PIPER_URL),
      detail: url(env.PIPER_URL) ? "PIPER_URL is set (CPU-friendly)." : "Set PIPER_URL to a Piper sidecar.",
    },
    {
      provider: "comfyui",
      type: "self-hosted",
      capabilities: ["image"],
      models: ["custom-workflow"],
      local: true,
      gpuRequired: true,
      configured: url(env.COMFYUI_URL) && Boolean(env.COMFYUI_WORKFLOW),
      detail:
        url(env.COMFYUI_URL) && env.COMFYUI_WORKFLOW
          ? "COMFYUI_URL + workflow are set."
          : "Set COMFYUI_URL and COMFYUI_WORKFLOW for workflow image generation.",
    },
    {
      provider: "ace-step",
      type: "self-hosted",
      capabilities: ["music"],
      models: ["ace-step"],
      local: true,
      gpuRequired: true,
      configured: url(env.ACE_STEP_URL),
      detail: url(env.ACE_STEP_URL) ? "ACE_STEP_URL is set." : "Set ACE_STEP_URL for AI music generation.",
    },
    {
      provider: "rendiv",
      type: "self-hosted",
      capabilities: ["rendering"],
      models: ["mp4", "webm", "gif"],
      local: true,
      gpuRequired: false,
      configured: url(env.RENDIV_URL),
      detail: url(env.RENDIV_URL)
        ? "RENDIV_URL is set (needs Chromium + FFmpeg on the runner)."
        : "Set RENDIV_URL to a self-hosted render worker.",
    },
    {
      provider: "ffmpeg",
      type: "local",
      capabilities: ["transcode", "trim", "concat", "mix", "subtitles", "thumbnails", "probe"],
      models: [],
      local: true,
      gpuRequired: false,
      configured: ffmpegStatus().available,
      detail: ffmpegStatus().available
        ? `FFmpeg ${ffmpegStatus().version ?? "unknown"} detected.`
        : "No FFmpeg binary found (FFMPEG_PATH or PATH).",
    },
  ];
}

/** Registry plus live health for self-hosted services (3s probes, run in parallel). */
export async function describeProvidersWithHealth(): Promise<ProviderDescriptor[]> {
  const { probeHealth } = await import("@/src/server/ai/gateway");
  const env = getServerEnv();
  const urls: Record<string, string | undefined> = {
    whisperx: env.WHISPERX_URL,
    piper: env.PIPER_URL,
    comfyui: env.COMFYUI_URL,
    "ace-step": env.ACE_STEP_URL,
    rendiv: env.RENDIV_URL,
  };
  const base = describeProviders();
  return Promise.all(
    base.map(async (p) => {
      if (p.provider in urls) {
        if (!p.configured) return { ...p, health: "not-configured" as const };
        return { ...p, health: await probeHealth(urls[p.provider]) };
      }
      if (p.provider === "ffmpeg") return { ...p, health: p.configured ? ("healthy" as const) : ("not-configured" as const) };
      return { ...p, health: p.configured ? ("configured" as const) : ("not-configured" as const) };
    }),
  );
}
