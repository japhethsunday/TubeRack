import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, modelOrder, type ChatProvider } from "@/src/server/ai/chat-compat";

export { stripThinking } from "@/src/server/ai/chat-compat";

/**
 * NVIDIA hosted models (build.nvidia.com), taken from the account's live
 * model list. Names NVIDIA stops serving are skipped automatically.
 */
export const NVIDIA_TEXT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "deepseek-ai/deepseek-v4.1-flash",
  "moonshotai/kimi-k3",
  "z-ai/glm-5.3",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "google/gemma-4-31b-it",
  "mistralai/mistral-nemotron",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "openai/gpt-oss-20b",
  "z-ai/glm-5.3-flash",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "mistralai/mistral-large",
  "microsoft/phi-3.5-moe-instruct",
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
