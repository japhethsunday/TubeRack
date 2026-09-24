import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { chatGenerateText, type ChatProvider } from "@/src/server/ai/chat-compat";
import { extractJsonObject } from "@/src/lib/ai-gateway/json";
import { getGeminiClient, GeminiTextProvider, GeminiTtsProvider } from "@/src/server/ai/gemini";
import { NVIDIA_TEXT_MODELS } from "@/src/server/ai/nvidia";
import { MISTRAL_TEXT_MODELS } from "@/src/server/ai/mistral";
import { mistralSpeechChunk, mistralTranscribe } from "@/src/server/ai/mistral";

export const maxDuration = 300;

/**
 * GET /api/v1/system/ai-check — live health check of every configured AI
 * model (tiny real request each). Reports pass/fail and timing only: no
 * keys, no prompts, no outputs. Runs at most once per 20 minutes; other
 * calls get the cached report.
 */
type Check = { provider: string; model: string; test: string; ok: boolean; ms: number; error?: string };



let cache: { at: number; report: unknown } | null = null;
let running: Promise<unknown> | null = null;

function clean(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/(nvapi-|Bearer\s+)[\w-]+/gi, "$1***").slice(0, 180);
}

async function timed(provider: string, model: string, test: string, fn: () => Promise<void>): Promise<Check> {
  const t = Date.now();
  try {
    await fn();
    return { provider, model, test, ok: true, ms: Date.now() - t };
  } catch (error) {
    return { provider, model, test, ok: false, ms: Date.now() - t, error: clean(error) };
  }
}

async function catalog(baseUrl: string, key: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [`error ${res.status}`];
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean).sort();
  } catch (error) {
    return [`error ${clean(error)}`];
  }
}

async function pool<T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await items[n]();
      }
    }),
  );
  return out;
}

function textChecks(p: Omit<ChatProvider, "models">, providerName: string, models: string[]) {
  return models.flatMap((model) => {
    const one: ChatProvider = { ...p, models: [model] };
    return [
      () =>
        timed(providerName, model, "text", async () => {
          const out = await chatGenerateText(one, { prompt: "Write one short sentence about YouTube thumbnails.", maxTokens: 120 }, { budgetMs: 60_000, attemptMs: 55_000 });
          if (out.text.length < 10) throw new Error("reply too short");
        }),
      () =>
        timed(providerName, model, "json", async () => {
          const out = await chatGenerateText(one, { prompt: 'Return {"titles":["a","b"]} with two short video titles about cooking.', maxTokens: 200, json: true }, { budgetMs: 60_000, attemptMs: 55_000 });
          const obj = extractJsonObject(out.text) as { titles?: unknown } | null;
          if (!obj || !Array.isArray(obj.titles)) throw new Error("JSON missing titles");
        }),
    ];
  });
}

async function run() {
  const env = getServerEnv();
  const jobs: (() => Promise<Check>)[] = [];
  const mistralJobs: (() => Promise<Check>)[] = [];
  const catalogs: Record<string, string[]> = {};

  if (env.GEMINI_API_KEY) {
    for (const model of ["gemini-pro-latest", "gemini-3.6-flash", "gemini-flash-latest"]) {
      jobs.push(() =>
        timed("gemini", model, "text", async () => {
          const r = await getGeminiClient(env).models.generateContent({ model, contents: "Write one short sentence about YouTube thumbnails.", config: { maxOutputTokens: 400 } });
          if (!r.text?.trim()) throw new Error("empty reply");
        }),
      );
    }
  }
  if (env.MISTRAL_API_KEY) {
    catalogs.mistral = await catalog("https://api.mistral.ai/v1", env.MISTRAL_API_KEY);
    const live = new Set(catalogs.mistral);
    const wanted = env.MISTRAL_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? MISTRAL_TEXT_MODELS;
    for (const m of wanted.filter((m) => !live.has(m))) jobs.push(async () => ({ provider: "mistral", model: m, test: "listed", ok: false, ms: 0, error: "not in this account's model list (skipped by the app)" }));
    mistralJobs.push(...textChecks({ name: "Mistral", baseUrl: "https://api.mistral.ai/v1", key: env.MISTRAL_API_KEY }, "mistral", wanted.filter((m) => live.has(m))));
    mistralJobs.push(() =>
      timed("mistral", "voxtral-mini-tts-2603 + voxtral-mini-latest", "voice+captions", async () => {
        const { pcm, rate } = await mistralSpeechChunk("This is a quick voice test for the TubeRack studio. Captions should follow.");
        if (pcm.length < rate) throw new Error("audio shorter than half a second");
        const header = Buffer.alloc(44);
        header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
        header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
        header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
        const t = await mistralTranscribe(new Uint8Array(Buffer.concat([header, pcm])), "audio/wav");
        if (!/voice|test|studio/i.test(t.text)) throw new Error(`transcript didn't match: "${t.text.slice(0, 60)}"`);
      }),
    );
  }
  if (env.NVIDIA_API_KEY) {
    catalogs.nvidia = await catalog("https://integrate.api.nvidia.com/v1", env.NVIDIA_API_KEY);
    const live = new Set(catalogs.nvidia);
    const wanted = env.NVIDIA_TEXT_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? NVIDIA_TEXT_MODELS;
    for (const m of wanted.filter((m) => !live.has(m))) jobs.push(async () => ({ provider: "nvidia", model: m, test: "listed", ok: false, ms: 0, error: "not in NVIDIA's live model list" }));
    jobs.push(...textChecks({ name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", key: env.NVIDIA_API_KEY }, "nvidia", wanted.filter((m) => live.has(m))));
  }

  // The app's real paths, with every fallback in play.
  const appJobs: (() => Promise<Check>)[] = [
    () =>
      timed("app", "text chain", "script-style text", async () => {
        const out = await new GeminiTextProvider().generateText({ prompt: "Write a two-sentence YouTube video hook about saving money.", maxTokens: 300 });
        if (out.text.length < 20) throw new Error("reply too short");
      }),
    () =>
      timed("app", "text chain", "json", async () => {
        const out = await new GeminiTextProvider().generateText({ prompt: 'Return {"ideas":["…","…","…"]} with three video ideas about home workouts.', maxTokens: 400, json: true });
        const obj = extractJsonObject(out.text) as { ideas?: unknown } | null;
        if (!obj || !Array.isArray(obj.ideas)) throw new Error("JSON missing ideas");
      }),
    () =>
      timed("app", "voice chain", "voice-over", async () => {
        const out = await new GeminiTtsProvider().synthesizeSpeech({ text: "Welcome back to the channel. Today we test the full voice pipeline." });
        if (out.durationSec < 1) throw new Error("audio too short");
      }),
  ];
  // Mistral's free tier allows about one request per second: run its checks one at a time.
  const [checks, mistralChecks, appChecks] = await Promise.all([pool(jobs, 4), pool(mistralJobs, 1), pool(appJobs, 1)]);
  checks.push(...mistralChecks, ...appChecks);
  // Catalog excerpts help pick replacements; chat-capable families only.
  const pick = (ids: string[]) => ids.filter((id) => /instruct|chat|large|medium|small|nemotron|llama|qwen|deepseek|kimi|glm|gemma|mistral|magistral|ministral|gpt-oss/i.test(id)).slice(0, 150);
  return {
    ranAt: new Date().toISOString(),
    configured: { gemini: Boolean(env.GEMINI_API_KEY), mistral: Boolean(env.MISTRAL_API_KEY), nvidia: Boolean(env.NVIDIA_API_KEY) },
    summary: { passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length },
    checks,
    catalogs: Object.fromEntries(Object.entries(catalogs).map(([k, v]) => [k, pick(v)])),
  };
}

export async function GET() {
  if (cache && Date.now() - cache.at < 20 * 60_000) return NextResponse.json({ data: cache.report, cached: true });
  running ??= run()
    .then((report) => {
      cache = { at: Date.now(), report };
      return report;
    })
    .finally(() => {
      running = null;
    });
  const report = await running;
  return NextResponse.json({ data: report, cached: false });
}
