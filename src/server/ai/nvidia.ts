import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, modelOrder, type ChatProvider } from "@/src/server/ai/chat-compat";

export { stripThinking } from "@/src/server/ai/chat-compat";

/**
 * NVIDIA hosted models (build.nvidia.com), taken from the account's live
 * model list. Names NVIDIA stops serving are skipped automatically.
 */
// Ordered by live results on this account (speed + quality). Models that
// timed out or aren't enabled for the account were left out.
export const NVIDIA_TEXT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "z-ai/glm-5.3",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "google/gemma-4-31b-it",
  "mistralai/mistral-nemotron",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "z-ai/glm-5.3-flash",
  "openai/gpt-oss-20b",
]

export function isNvidiaConfigured(env = getServerEnv()): boolean {
  return Boolean(env.NVIDIA_API_KEY);
}

function provider(env = getServerEnv()): ChatProvider {
  if (!env.NVIDIA_API_KEY) throw new Error("NVIDIA models are not configured.");
  const custom = env.NVIDIA_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return { name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", key: env.NVIDIA_API_KEY, models: custom?.length ? custom : NVIDIA_TEXT_MODELS };
}

export function nvidiaModelOrder(env = getServerEnv()): Promise<string[]> {
  return modelOrder(provider(env));
}

export function nvidiaGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(provider(), request, opts);
}
