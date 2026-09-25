import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText } from "@/src/server/ai/chat-compat";

// Model names below come from this account's live model list (Sep 2026).
/**
 * BytePlus ModelArk (ai.byteplus.com/ark): Seed text models, Seedream
 * images and Seedance video. Chat and images use OpenAI-style endpoints;
 * video is an async task that is created and then polled. Model names can
 * be overridden in the environment (a model id or an "ep-…" endpoint id).
 */
const DEFAULT_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

export const ARK_TEXT_MODELS = ["seed-2-0-lite-260428", "dola-seed-2-1-turbo-260628", "seed-2-0-mini-260428", "seed-1-8-251228", "deepseek-v4-flash-ga-260731", "seed-1-6-flash-250715"];
export const ARK_IMAGE_MODELS = ["dola-seedream-5-0-flash-260915", "seedream-5-0-260128", "seedream-4-5-251128", "seedream-4-0-250828"];
export const ARK_VIDEO_MODELS = ["dreamina-seedance-2-0-fast-260128", "dreamina-seedance-2-0-mini-260615", "seedance-1-5-pro-251215", "seedance-1-0-pro-fast-251015"];

const list = (v: string | undefined, fallback: string[]) => {
  const custom = v?.split(",").map((m) => m.trim()).filter(Boolean);
  return custom?.length ? custom : fallback;
};

export function isArkConfigured(env = getServerEnv()): boolean {
  return Boolean(env.ARK_API_KEY);
}

function base(env = getServerEnv()): string {
  return (env.ARK_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function key(env = getServerEnv()): string {
  if (!env.ARK_API_KEY) throw new Error("BytePlus ModelArk is not configured.");
  return env.ARK_API_KEY;
}

export function arkTextModels(env = getServerEnv()): string[] {
  return list(env.ARK_TEXT_MODELS, ARK_TEXT_MODELS);
}
export function arkImageModels(env = getServerEnv()): string[] {
  return list(env.ARK_IMAGE_MODELS, ARK_IMAGE_MODELS);
}
export function arkVideoModels(env = getServerEnv()): string[] {
  return list(env.ARK_VIDEO_MODELS, ARK_VIDEO_MODELS);
}

export function arkGenerateText(request: { prompt: string; maxTokens?: number; json?: boolean }, opts?: { budgetMs?: number; attemptMs?: number }, models?: string[]) {
  const env = getServerEnv();
  return chatGenerateText({ name: "BytePlus", baseUrl: base(env), key: key(env), models: models ?? arkTextModels(env) }, request, opts);
}

const IMAGE_SIZES: Record<string, string> = { "16:9": "2560x1440", "9:16": "1440x2560", "1:1": "2048x2048" };

async function arkError(res: Response, what: string): Promise<Error> {
  const text = (await res.text()).slice(0, 220);
  return new Error(`BytePlus ${what} ${res.status}: ${text}`);
}

/** Seedream image; returns a data URL. Tries each model until one answers. */
export async function arkGenerateImage(prompt: string, aspect: "16:9" | "9:16" | "1:1", models?: string[]): Promise<{ dataUrl: string; model: string }> {
  const env = getServerEnv();
  let last: unknown = new Error("No BytePlus image model answered.");
  for (const model of models ?? arkImageModels(env)) {
    try {
      const res = await fetch(`${base(env)}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key(env)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size: IMAGE_SIZES[aspect], response_format: "b64_json", watermark: false }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        last = await arkError(res, `image ${model}`);
        continue;
      }
      const body = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const item = body.data?.[0];
      if (item?.b64_json) return { dataUrl: `data:image/jpeg;base64,${item.b64_json}`, model };
      if (item?.url) {
        const img = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
        if (img.ok) {
          const bytes = Buffer.from(await img.arrayBuffer());
          return { dataUrl: `data:${img.headers.get("content-type") || "image/jpeg"};base64,${bytes.toString("base64")}`, model };
        }
      }
      last = new Error(`BytePlus image ${model}: no image in reply`);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** Start a Seedance text-to-video task; returns its id. */
export async function arkStartVideo(prompt: string, opts: { model: string; aspect: "16:9" | "9:16" | "1:1"; seconds?: number }): Promise<string> {
  const env = getServerEnv();
  const text = `${prompt} --ratio ${opts.aspect} --duration ${opts.seconds ?? 5} --watermark false`;
  const res = await fetch(`${base(env)}/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, content: [{ type: "text", text }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await arkError(res, `video ${opts.model}`);
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`BytePlus video ${opts.model}: no task id`);
  return body.id;
}

export interface ArkVideoStatus {
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
  videoUrl?: string;
  error?: string;
}

/** Check a Seedance task. */
export async function arkVideoStatus(taskId: string): Promise<ArkVideoStatus> {
  const env = getServerEnv();
  const res = await fetch(`${base(env)}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key(env)}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw await arkError(res, "video status");
  const body = (await res.json()) as { status?: string; content?: { video_url?: string }; error?: { message?: string } | null };
  return { status: body.status ?? "unknown", videoUrl: body.content?.video_url, error: body.error?.message };
}

/** Model ids the account can see, if the API lists them (null when it doesn't). */
export async function arkListModels(): Promise<string[] | null> {
  const env = getServerEnv();
  try {
    const res = await fetch(`${base(env)}/models`, { headers: { Authorization: `Bearer ${key(env)}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean).sort();
  } catch {
    return null;
  }
}
