import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";
import { toCaptionLines, type MistralSegment } from "@/src/server/ai/mistral";

/**
 * Cloudflare Workers AI (OpenAI-compatible): Cloudflare-hosted open models used
 * as a free backup for text. Runs on the account's daily free allowance; the
 * token never leaves the server.
 */
export const CF_TEXT_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-3-12b-it",
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

const runUrl = (model: string, env = getServerEnv()) => `https://api.cloudflare.com/client/v4/accounts/${account(env)}/ai/run/${model}`;
const auth = (env = getServerEnv()) => ({ Authorization: `Bearer ${(env.CF_AI_TOKEN ?? "").trim()}` });

const SIZES = { "16:9": [1344, 768], "9:16": [768, 1344], "1:1": [1024, 1024] } as const;

/** FLUX pictures: FLUX.2 klein (sized to the aspect), then FLUX.1 schnell (square). */
export async function cloudflareGenerateImage(prompt: string, aspect: "16:9" | "9:16" | "1:1"): Promise<{ dataUrl: string; model: string }> {
  const env = getServerEnv();
  let last: unknown = new Error("No Cloudflare picture model answered.");
  try {
    const [w, h] = SIZES[aspect];
    const form = new FormData();
    form.append("prompt", prompt.slice(0, 2000));
    form.append("width", String(w));
    form.append("height", String(h));
    const res = await fetch(runUrl("@cf/black-forest-labs/flux-2-klein-4b", env), { method: "POST", headers: auth(env), body: form, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Cloudflare flux-2-klein ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = (await res.json()) as { result?: { image?: string } };
    if (body.result?.image) return { dataUrl: `data:image/png;base64,${body.result.image}`, model: "flux-2-klein-4b (cloudflare)" };
    throw new Error("Cloudflare flux-2-klein returned no image.");
  } catch (error) {
    last = error;
  }
  try {
    const res = await fetch(runUrl("@cf/black-forest-labs/flux-1-schnell", env), {
      method: "POST",
      headers: { ...auth(env), "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 8 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Cloudflare flux-1-schnell ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = (await res.json()) as { result?: { image?: string } };
    if (body.result?.image) return { dataUrl: `data:image/jpeg;base64,${body.result.image}`, model: "flux-1-schnell (cloudflare)" };
    throw new Error("Cloudflare flux-1-schnell returned no image.");
  } catch (error) {
    last = error;
  }
  throw last;
}

/** Whisper large v3 turbo: text plus timed segments for captions. */
export async function cloudflareTranscribe(bytes: Uint8Array): Promise<{ text: string; segments: MistralSegment[]; model: string }> {
  const env = getServerEnv();
  const res = await fetch(runUrl("@cf/openai/whisper-large-v3-turbo", env), {
    method: "POST",
    headers: { ...auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ audio: Buffer.from(bytes).toString("base64") }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Cloudflare transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { result?: { text?: string; segments?: { start?: number; end?: number; text?: string }[] } };
  const segments = toCaptionLines(
    (body.result?.segments ?? [])
      .map((s) => ({ startSec: Number(s.start), endSec: Number(s.end), text: String(s.text ?? "").trim() }))
      .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec && s.text),
  );
  if (segments.length === 0) throw new Error("Cloudflare transcription returned no timed segments");
  return { text: body.result?.text?.trim() || segments.map((s) => s.text).join(" "), segments, model: "whisper-large-v3-turbo" };
}
