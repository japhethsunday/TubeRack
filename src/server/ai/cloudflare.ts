import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";
import { toCaptionLines, type MistralSegment } from "@/src/server/ai/mistral";

/**
 * Cloudflare Workers AI: every Cloudflare-hosted text, picture and caption
 * model, used as free backups (daily free allowance). New models Cloudflare
 * adds are picked up from its catalog automatically. The token never leaves
 * the server.
 */

/** Text models, strongest first. */
export const CF_TEXT_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/openai/gpt-oss-20b",
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/qwen/qwq-32b",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "@cf/qwen/qwen3.8-27b",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.2-lora",
  "@cf/meta/llama-3.2-1b-instruct",
];

/**
 * Not usable on the free plan (paid-only, retired, or needs a licence
 * agreement) — never tried, even if the catalog lists them.
 */
const CF_BLOCKED = /deepseek-v4|glm-5\.|kimi-k2|llama-3\.1-8b-instruct$|llama-3\.2-11b-vision|flux-2-dev/i;

/** Picture models, best first (inpainting needs a source picture, so it's left out). */
export const CF_IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-9b",
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/leonardo/lucid-origin",
  "@cf/leonardo/phoenix-1.0",
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
];

/** Speech-to-text models, best first. */
export const CF_ASR_MODELS = ["@cf/openai/whisper-large-v3-turbo", "@cf/deepgram/nova-3", "@cf/openai/whisper", "@cf/openai/whisper-tiny-en"];

function account(env = getServerEnv()): string {
  const raw = (env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || "").trim();
  return raw.match(/[0-9a-f]{32}/i)?.[0].toLowerCase() ?? "";
}

export function isCloudflareAiConfigured(env = getServerEnv()): boolean {
  return Boolean(env.CF_AI_TOKEN?.trim() && account(env));
}

const api = (env = getServerEnv()) => `https://api.cloudflare.com/client/v4/accounts/${account(env)}/ai`;
const auth = (env = getServerEnv()) => ({ Authorization: `Bearer ${(env.CF_AI_TOKEN ?? "").trim()}` });

/** Models Cloudflare lists for a task (cached 6h), so newly added ones are used too. */
const catalog = new Map<string, { at: number; ids: string[] }>();
async function discover(task: string): Promise<string[]> {
  const hit = catalog.get(task);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.ids;
  let ids: string[] = [];
  try {
    const res = await fetch(`${api()}/models/search?per_page=200&task=${encodeURIComponent(task)}`, { headers: auth(), signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const body = (await res.json()) as { result?: { name?: string }[] };
      ids = (body.result ?? []).map((m) => String(m.name ?? "")).filter((n) => n.startsWith("@cf/"));
    }
  } catch {
    ids = [];
  }
  catalog.set(task, { at: Date.now(), ids });
  return ids;
}

/** Known models first (in quality order), then anything new from the catalog. */
async function withCatalog(known: string[], task: string, skip: RegExp): Promise<string[]> {
  const extra = (await discover(task)).filter((id) => !known.includes(id) && !skip.test(id) && !CF_BLOCKED.test(id));
  return [...known, ...extra];
}

export async function cloudflareTextModels(): Promise<string[]> {
  const custom = getServerEnv().CF_AI_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  if (custom?.length) return custom;
  return withCatalog(CF_TEXT_MODELS, "Text Generation", /guard|lora$|-base$/i);
}

function provider(models: string[]): ChatProvider {
  return { name: "Cloudflare", baseUrl: `${api()}/v1`, key: (getServerEnv().CF_AI_TOKEN ?? "").trim(), models };
}

export async function cloudflareGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(provider(await cloudflareTextModels()), request, opts);
}

/** One named text model (used by the admin test). */
export function cloudflareTextWith(model: string, request: { prompt: string; maxTokens?: number }, opts?: { budgetMs?: number; attemptMs?: number }) {
  return chatGenerateText(provider([model]), request, opts);
}

const SIZES = { "16:9": [1344, 768], "9:16": [768, 1344], "1:1": [1024, 1024] } as const;

/** Read a picture from either a raw image reply or JSON { result: { image } }. */
async function readImage(res: Response): Promise<string> {
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) return `data:${type.split(";")[0]};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  const body = (await res.json()) as { result?: { image?: string } };
  if (!body.result?.image) throw new Error("no image in reply");
  const img = body.result.image;
  return img.startsWith("data:") ? img : `data:image/${img.startsWith("/9j") ? "jpeg" : "png"};base64,${img}`;
}

/** One picture from one named model. */
export async function cloudflareImageWith(model: string, prompt: string, aspect: "16:9" | "9:16" | "1:1"): Promise<string> {
  const env = getServerEnv();
  const [w, h] = SIZES[aspect];
  const text = prompt.slice(0, 2000);
  let init: RequestInit;
  if (/flux-2/.test(model)) {
    // FLUX.2 takes multipart form data, even for a plain prompt.
    const form = new FormData();
    form.append("prompt", text);
    form.append("width", String(w));
    form.append("height", String(h));
    init = { method: "POST", headers: auth(env), body: form };
  } else {
    const input: Record<string, unknown> = { prompt: text };
    if (/flux-1-schnell/.test(model)) input.steps = 8;
    else { input.width = w; input.height = h; }
    init = { method: "POST", headers: { ...auth(env), "Content-Type": "application/json" }, body: JSON.stringify(input) };
  }
  const res = await fetch(`${api(env)}/run/${model}`, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Cloudflare ${model.split("/").pop()} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return readImage(res);
}

export async function cloudflareImageModels(): Promise<string[]> {
  return withCatalog(CF_IMAGE_MODELS, "Text-to-Image", /inpaint|img2img/i);
}

/** Pictures: each Cloudflare picture model in turn until one answers. */
export async function cloudflareGenerateImage(prompt: string, aspect: "16:9" | "9:16" | "1:1"): Promise<{ dataUrl: string; model: string }> {
  let last: unknown = new Error("No Cloudflare picture model answered.");
  const started = Date.now();
  for (const model of await cloudflareImageModels()) {
    if (Date.now() - started > 150_000) break;
    try {
      return { dataUrl: await cloudflareImageWith(model, prompt, aspect), model: `${model.split("/").pop()} (cloudflare)` };
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** Captions from one named speech model. */
export async function cloudflareTranscribeWith(model: string, bytes: Uint8Array): Promise<{ text: string; segments: MistralSegment[]; model: string }> {
  const env = getServerEnv();
  const name = model.split("/").pop() ?? model;
  let res: Response;
  if (/nova/.test(model)) {
    res = await fetch(`${api(env)}/run/${model}`, { method: "POST", headers: { ...auth(env), "Content-Type": "audio/wav" }, body: Buffer.from(bytes), signal: AbortSignal.timeout(120_000) });
  } else {
    // Turbo takes base64; the older Whisper models take the raw bytes as a number array.
    const audio = /turbo/.test(model) ? Buffer.from(bytes).toString("base64") : Array.from(bytes);
    res = await fetch(`${api(env)}/run/${model}`, { method: "POST", headers: { ...auth(env), "Content-Type": "application/json" }, body: JSON.stringify({ audio }), signal: AbortSignal.timeout(120_000) });
  }
  if (!res.ok) throw new Error(`Cloudflare ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    result?: {
      text?: string;
      segments?: { start?: number; end?: number; text?: string }[];
      words?: { start?: number; end?: number; word?: string }[];
      results?: { channels?: { alternatives?: { transcript?: string; words?: { start?: number; end?: number; word?: string; punctuated_word?: string }[] }[] }[] };
    };
  };
  const r = body.result ?? {};
  const alt = r.results?.channels?.[0]?.alternatives?.[0];
  // Segments when given; otherwise group word timings into short lines.
  let raw = (Array.isArray(r.segments) ? r.segments : []).map((s) => ({ startSec: Number(s.start), endSec: Number(s.end), text: String(s.text ?? "").trim() }));
  if (raw.length === 0) {
    const list = Array.isArray(alt?.words) ? alt.words : Array.isArray(r.words) ? r.words : [];
    const words = list.map((w) => ({ start: Number(w.start), end: Number(w.end), word: String(("punctuated_word" in w ? w.punctuated_word : undefined) ?? w.word ?? "").trim() }));
    for (let i = 0; i < words.length; i += 8) {
      const g = words.slice(i, i + 8);
      raw.push({ startSec: g[0].start, endSec: g[g.length - 1].end, text: g.map((w) => w.word).join(" ") });
    }
  }
  raw = raw.filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec && s.text);
  const segments = toCaptionLines(raw);
  const text = (r.text ?? alt?.transcript ?? "").trim() || segments.map((s) => s.text).join(" ");
  return { text, segments, model: name };
}

/** Captions: each Cloudflare speech model in turn until one gives timed lines. */
export async function cloudflareTranscribe(bytes: Uint8Array): Promise<{ text: string; segments: MistralSegment[]; model: string }> {
  let last: unknown = new Error("No Cloudflare speech model answered.");
  for (const model of await withCatalog(CF_ASR_MODELS, "Automatic Speech Recognition", /flux$|smart-turn/i)) {
    try {
      const r = await cloudflareTranscribeWith(model, bytes);
      if (r.segments.length) return r;
      last = new Error(`Cloudflare ${r.model} returned no timed segments`);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** A 1-second 440 Hz tone as a 16 kHz mono WAV (for testing speech models). */
export function testToneWav(): Uint8Array {
  const rate = 16000;
  const n = rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return new Uint8Array(buf);
}

/** Try every Cloudflare model once and report which ones answer. */
export async function testAllCloudflareModels(): Promise<{
  summary: string;
  text: { model: string; ok: boolean; ms: number; note: string }[];
  images: { model: string; ok: boolean; ms: number; note: string }[];
  captions: { model: string; ok: boolean; ms: number; note: string }[];
}> {
  const short = (m: string) => m.split("/").pop() ?? m;
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/Cloudflare \S+ /, "").slice(0, 140);
  async function pool<T>(items: string[], n: number, fn: (m: string) => Promise<T>): Promise<T[]> {
    const out: T[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  }
  const timed = async (model: string, run: () => Promise<string>) => {
    const t = Date.now();
    try {
      const note = await run();
      return { model: short(model), ok: true, ms: Date.now() - t, note };
    } catch (e) {
      return { model: short(model), ok: false, ms: Date.now() - t, note: msg(e) };
    }
  };
  const tone = testToneWav();
  const [text, images, captions] = await Promise.all([
    pool(await cloudflareTextModels(), 6, (m) => timed(m, async () => (await cloudflareTextWith(m, { prompt: "Say OK.", maxTokens: 20 }, { budgetMs: 45_000, attemptMs: 40_000 })).text.slice(0, 40))),
    pool(await cloudflareImageModels(), 3, (m) => timed(m, async () => `${Math.round(((await cloudflareImageWith(m, "A red apple on a table, photo", "1:1")).length * 3) / 4 / 1024)} KB`)),
    pool(await withCatalog(CF_ASR_MODELS, "Automatic Speech Recognition", /flux$|smart-turn/i), 2, (m) => timed(m, async () => { await cloudflareTranscribeWith(m, tone); return "answered"; })),
  ]);
  const count = (xs: { ok: boolean }[]) => `${xs.filter((x) => x.ok).length}/${xs.length}`;
  return { summary: `Text ${count(text)} · Pictures ${count(images)} · Captions ${count(captions)}`, text, images, captions };
}
