import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, modelOrder, type ChatProvider } from "@/src/server/ai/chat-compat";

export { stripThinking } from "@/src/server/ai/chat-compat";

/**
 * NVIDIA hosted models (build.nvidia.com). Names NVIDIA no longer serves
 * are skipped automatically (checked against the live model list).
 */
const DEFAULT_MODELS = [
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "meta/llama-3.3-70b-instruct",
  "qwen/qwen3.5-397b-a17b",
  "mistralai/mistral-large-2-instruct",
  "deepseek-ai/deepseek-v3.1",
  "moonshotai/kimi-k2.6",
  "z-ai/glm-5.1",
  "google/gemma-3-27b-it",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct",
];

export function isNvidiaConfigured(env = getServerEnv()): boolean {
  return Boolean(env.NVIDIA_API_KEY);
}

function provider(env = getServerEnv()): ChatProvider {
  if (!env.NVIDIA_API_KEY) throw new Error("NVIDIA models are not configured.");
  const custom = env.NVIDIA_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return { name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", key: env.NVIDIA_API_KEY, models: custom?.length ? custom : DEFAULT_MODELS };
}

export function nvidiaModelOrder(env = getServerEnv()): Promise<string[]> {
  return modelOrder(provider(env));
}

export function nvidiaGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(provider(), request, opts);
}
