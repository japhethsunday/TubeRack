import { getServerEnv } from "@/src/lib/env";
import { isGeminiConfigured, getGeminiModels } from "@/src/server/ai/gemini";
import { isYouTubeConfigured } from "@/src/server/youtube/client";

/**
 * Provider registry: every external API the app uses, with capabilities,
 * models, and configuration status. Presence only — no secrets, keys, or
 * URLs ever leave the server. The UI reads GET /api/v1/system/providers
 * and must never show a feature as available when `configured` is false.
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
}

export function describeProviders(): ProviderDescriptor[] {
  const env = getServerEnv();
  const gemini = getGeminiModels(env);
  return [
    {
      provider: "gemini",
      type: "cloud",
      capabilities: ["text", "intelligence", "image", "tts", "transcription"],
      models: [gemini.text, gemini.image, gemini.tts],
      local: false,
      gpuRequired: false,
      configured: isGeminiConfigured(env),
      detail: isGeminiConfigured(env) ? "GEMINI_API_KEY is set." : "Set GEMINI_API_KEY to enable.",
    },
    {
      provider: "nvidia",
      type: "cloud",
      capabilities: ["text", "intelligence"],
      models: env.NVIDIA_TEXT_MODELS ? env.NVIDIA_TEXT_MODELS.split(",").map((m) => m.trim()).filter(Boolean) : ["build.nvidia.com catalog"],
      local: false,
      gpuRequired: false,
      configured: Boolean(env.NVIDIA_API_KEY),
      detail: env.NVIDIA_API_KEY ? "NVIDIA_API_KEY is set; used when Gemini is busy or unavailable." : "Set NVIDIA_API_KEY to add NVIDIA-hosted models as backup.",
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
        : "Keyless oEmbed fallback available; set YOUTUBE_API_KEY for search and metrics.",
    },
    {
      provider: "resend",
      type: "cloud",
      capabilities: ["email"],
      models: [],
      local: false,
      gpuRequired: false,
      configured: Boolean(env.RESEND_API_KEY),
      detail: env.RESEND_API_KEY ? "RESEND_API_KEY is set." : "Set RESEND_API_KEY to send verification and reset email.",
    },
  ];
}
