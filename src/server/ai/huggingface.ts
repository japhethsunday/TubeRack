import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";

/**
 * Hugging Face Inference Providers: one token, many open models. Used as
 * extra backups after the main providers. Every model below answered a live
 * test on this account; names Hugging Face stops serving are skipped.
 */
export const HF_TEXT_MODELS = [
  "openai/gpt-oss-120b",
  "meta-llama/Llama-3.3-70B-Instruct",
  "deepseek-ai/DeepSeek-V3.2",
  "Qwen/Qwen3-235B-A22B-Instruct-2507",
  "google/gemma-3-27b-it",
  "Qwen/Qwen2.5-72B-Instruct",
  "zai-org/GLM-4.6",
  "moonshotai/Kimi-K2-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
];

const ROUTER = "https://router.huggingface.co";

export function isHuggingFaceConfigured(env = getServerEnv()): boolean {
  return Boolean(env.HF_TOKEN?.trim());
}

function provider(env = getServerEnv()): ChatProvider {
  if (!env.HF_TOKEN) throw new Error("Hugging Face is not configured.");
  return { name: "Hugging Face", baseUrl: `${ROUTER}/v1`, key: env.HF_TOKEN, models: HF_TEXT_MODELS };
}

export function hfGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(provider(), request, opts);
}

const SIZES: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 1024, height: 1024 },
};

/** FLUX pictures through Hugging Face's partners (nscale, then fal). Returns a data URL. */
export async function hfGenerateImage(prompt: string, aspect: "16:9" | "9:16" | "1:1"): Promise<{ dataUrl: string; model: string }> {
  const env = getServerEnv();
  if (!env.HF_TOKEN) throw new Error("Hugging Face is not configured.");
  const headers = { Authorization: `Bearer ${env.HF_TOKEN}`, "Content-Type": "application/json" };
  const size = SIZES[aspect];
  let last: unknown = new Error("No Hugging Face picture model answered.");
  // nscale: OpenAI-style images API.
  try {
    const res = await fetch(`${ROUTER}/nscale/v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "black-forest-labs/FLUX.1-schnell", prompt, response_format: "b64_json", size: `${size.width}x${size.height}` }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Hugging Face (nscale) ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = body.data?.[0]?.b64_json;
    if (b64) return { dataUrl: `data:image/png;base64,${b64}`, model: "flux.1-schnell (nscale)" };
    throw new Error("Hugging Face (nscale) returned no image.");
  } catch (error) {
    last = error;
  }
  // fal: returns the picture inline (sync mode) or as a URL.
  try {
    const res = await fetch(`${ROUTER}/fal-ai/fal-ai/flux/schnell`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, sync_mode: true, image_size: size }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Hugging Face (fal) ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = (await res.json()) as { images?: { url?: string; content_type?: string }[] };
    const url = body.images?.[0]?.url;
    if (url?.startsWith("data:image/")) return { dataUrl: url, model: "flux.1-schnell (fal)" };
    if (url && /^https:\/\//.test(url)) {
      const img = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (img.ok) {
        const bytes = Buffer.from(await img.arrayBuffer());
        return { dataUrl: `data:${img.headers.get("content-type") || "image/jpeg"};base64,${bytes.toString("base64")}`, model: "flux.1-schnell (fal)" };
      }
    }
    throw new Error("Hugging Face (fal) returned no image.");
  } catch (error) {
    last = error;
  }
  throw last;
}
