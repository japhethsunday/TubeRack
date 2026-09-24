import { getServerEnv } from "@/src/lib/env";
import { extractJsonObject } from "@/src/lib/ai-gateway/json";

/**
 * NVIDIA hosted models (build.nvidia.com), OpenAI-compatible chat API.
 * Used as a second text provider: when Gemini is busy, slow, out of quota
 * or unavailable, requests move through these models in order. The key
 * never leaves the server.
 */

const BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Preferred order: strong general writers first, then fast/smaller models.
 * Names NVIDIA no longer serves are skipped automatically (checked against
 * the live model list), so this list can safely run ahead of the catalog.
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

function configuredModels(env = getServerEnv()): string[] {
  const custom = env.NVIDIA_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return custom?.length ? custom : DEFAULT_MODELS;
}

let catalog: { ids: Set<string>; at: number } | null = null;

/** Live model ids (cached for an hour). Null when the list can't be read — then every configured model is tried. */
async function liveModels(key: string): Promise<Set<string> | null> {
  if (catalog && Date.now() - catalog.at < 3_600_000) return catalog.ids;
  try {
    const res = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    const ids = new Set((body.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean));
    if (ids.size === 0) return null;
    catalog = { ids, at: Date.now() };
    return ids;
  } catch {
    return null;
  }
}

/** Reasoning models wrap their thinking in <think>…</think>; keep only the answer. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/** The models that will be tried, in order (exported for tests and status). */
export async function nvidiaModelOrder(env = getServerEnv()): Promise<string[]> {
  const wanted = configuredModels(env);
  const live = env.NVIDIA_API_KEY ? await liveModels(env.NVIDIA_API_KEY) : null;
  const available = live ? wanted.filter((m) => live.has(m)) : wanted;
  return available.length ? available : wanted;
}

export async function nvidiaGenerateText(
  request: { prompt: string; maxTokens?: number; json?: boolean },
  opts: { budgetMs?: number; attemptMs?: number } = {},
): Promise<{ text: string; model: string }> {
  const env = getServerEnv();
  const key = env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA models are not configured.");
  const deadline = Date.now() + (opts.budgetMs ?? 150_000);
  const requested = typeof request.maxTokens === "number" && Number.isFinite(request.maxTokens) ? Math.floor(request.maxTokens) : 2048;
  const maxTokens = request.json ? Math.min(16384, Math.max(4096, requested * 2)) : Math.min(8192, Math.max(256, requested));
  const prompt = request.json
    ? `${request.prompt}\n\nReply with valid JSON only — no prose, no code fences.`
    : request.prompt;
  let lastError: unknown = null;
  for (const model of await nvidiaModelOrder(env)) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: request.json ? 0.4 : 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(Math.min(opts.attemptMs ?? 70_000, left)),
      });
      if (!res.ok) {
        lastError = new Error(`NVIDIA ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue; // busy, rate-limited, missing or refused: try the next model
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = stripThinking(body.choices?.[0]?.message?.content ?? "");
      if (!text) {
        lastError = new Error(`NVIDIA ${model}: empty response`);
        continue;
      }
      if (request.json && !extractJsonObject(text)) {
        lastError = new Error(`NVIDIA ${model}: reply was not valid JSON`);
        continue;
      }
      return { text, model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No NVIDIA model could answer.");
}
