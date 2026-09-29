import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";

/**
 * Cloudflare Workers AI (OpenAI-compatible): Cloudflare-hosted open models used
 * as a free backup for text. Runs on the account's daily free allowance; the
 * token never leaves the server.
 */
export const CF_TEXT_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/meta/llama-3.1-8b-instruct",
];

function account(env = getServerEnv()): string {
  const raw = (env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || "").trim();
  return raw.match(/[0-9a-f]{32}/i)?.[0].toLowerCase() ?? "";
}

export function isCloudflareAiConfigured(env = getServerEnv()): boolean {
  return Boolean(env.CF_AI_TOKEN?.trim() && account(env));
}

function textProvider(env = getServerEnv()): ChatProvider {
  const custom = env.CF_AI_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return {
    name: "Cloudflare",
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${account(env)}/ai/v1`,
    key: (env.CF_AI_TOKEN ?? "").trim(),
    models: custom?.length ? custom : CF_TEXT_MODELS,
  };
}

export function cloudflareGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(textProvider(), request, opts);
}
