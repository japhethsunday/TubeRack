import { skillsFor, skillsForTask, type SkillId } from "@/src/server/ai/skills";
import { GoogleGenAI } from "@google/genai";
import { normalisePlan, type ChannelEvidence, type ChannelInputs, type ChannelPlan } from "@/src/lib/channel/plan";
import { stripMarkdown } from "@/src/lib/text/markdown";
import { extractJsonObject } from "@/src/lib/ai-gateway/json";
import { isNvidiaConfigured, nvidiaGenerateText } from "@/src/server/ai/nvidia";
import { arkGenerateImage, isArkConfigured } from "@/src/server/ai/ark";
import { cleanImagePrompt, isNvidiaImageConfigured, nvidiaGenerateImage } from "@/src/server/ai/nvidia-image";
import { isMistralConfigured, mistralGenerateText, mistralSpeechChunk, mistralTranscribe } from "@/src/server/ai/mistral";

type TextRequest = { prompt: string; maxTokens?: number; json?: boolean; skills?: SkillId[] };

/** Backup text providers, in order, that have keys set. */
function backupTextProviders(env = getServerEnv()): { name: string; run: (r: TextRequest) => Promise<{ text: string; model: string }> }[] {
  return [
    ...(isMistralConfigured(env) ? [{ name: "mistral", run: (r: TextRequest) => mistralGenerateText(r) }] : []),
    ...(isNvidiaConfigured(env) ? [{ name: "nvidia", run: (r: TextRequest) => nvidiaGenerateText(r) }] : []),
  ];
}

/** Try each backup provider in turn; throws the last error if none answers. */
async function backupText(request: TextRequest, env = getServerEnv()): Promise<{ text: string; model: string }> {
  let last: unknown = new Error("No backup text provider is configured.");
  for (const p of backupTextProviders(env)) {
    try {
      return await p.run(request);
    } catch (error) {
      last = error;
      console.error(`[${p.name}] text fallback failed:`, error instanceof Error ? error.message.slice(0, 300) : error);
    }
  }
  throw last;
}
import { getServerEnv } from "@/src/lib/env";
import { getGateway, type AIGateway } from "@/src/lib/ai-gateway/registry";
import {
  ProviderNotConfiguredError,
  type ImageProvider,
  type TextProvider,
  type TtsProvider,
} from "@/src/lib/ai-gateway/types";
import type { AICapability } from "@/src/types/domain";
import type { IntelligenceRequest } from "@/src/lib/ai-gateway/intelligence";
import { IntelligenceNotConfiguredError } from "@/src/lib/ai-gateway/intelligence";

/**
 * Server-only Google Gemini integration (primary AI provider).
 * Powers text generation, intelligence tasks, image generation, and speech
 * synthesis through the @google/genai SDK. The API key never leaves the
 * server: this module must only be imported from route handlers, server
 * components, workers, or tests — never from client components.
 */

// Pro when the key's plan includes it (a quota-less plan is skipped instantly), else Flash.
const DEFAULT_TEXT_MODEL = "gemini-pro-latest";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_TTS_VOICE = "Kore";

export interface GeminiModels {
  text: string;
  image: string;
  tts: string;
  voice: string;
}

/** Presence check without leaking values. */
export function isGeminiConfigured(env = getServerEnv()): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/** Text features work with Gemini, Mistral, NVIDIA, or any mix. */
export function isTextConfigured(env = getServerEnv()): boolean {
  return Boolean(env.GEMINI_API_KEY) || isMistralConfigured(env) || isNvidiaConfigured(env);
}

/** Resolved model names (env overrides, safe defaults). */
export function getGeminiModels(env = getServerEnv()): GeminiModels {
  return {
    text: env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    image: env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    tts: env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL,
    voice: env.GEMINI_TTS_VOICE || DEFAULT_TTS_VOICE,
  };
}

/** Lazy SDK client. Throws the gateway boundary error when unconfigured. */
export function getGeminiClient(env = getServerEnv()): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

/**
 * Backup models, tried in order when the primary is missing, retired, or
 * overloaded. "-latest" aliases track Google's current generation so the
 * chain keeps working as older models are retired for new keys.
 */
const FALLBACK_MODELS = {
  // Pro first for quality; Flash families have separate capacity and answer
  // fast when Pro is overloaded or slow. Missing models are skipped fast.
  text: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-pro", "gemini-2.5-flash"],
  image: ["gemini-3.1-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
  tts: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
} as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isModelMissing(error: unknown): boolean {
  return /not[ _]found|\b404\b|is not supported|unsupported model|no longer available|deprecated|retired/i.test(errorText(error));
}

/**
 * Hard quota: the key's plan allows none (or no more today) of this model —
 * e.g. free-tier keys get "limit: 0" for image models. Retrying won't help,
 * but a different model might.
 */
export function isQuotaBlocked(error: unknown): boolean {
  return /limit:\s*0\b|free[_ ]tier|billing|PerDay|per day|quota exceeded for metric/i.test(errorText(error));
}

/** Temporary capacity/rate problems worth retrying (503 overloaded, 429, transient 500s). */
export function isTransient(error: unknown): boolean {
  if (isQuotaBlocked(error)) return false;
  return /\b(503|429|500|502|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|try again later|deadline|ECONNRESET|fetch failed/i.test(
    errorText(error),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Model timed out after ${Math.round(ms / 1000)}s (deadline)`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resilient call: retry transient failures on the same model with
 * jittered backoff, then move down the fallback chain. Missing models skip
 * straight to the next one. Other errors fail immediately. Total time is
 * capped so requests stay inside the serverless limit.
 */
export async function withModelFallback<T>(
  model: string,
  fallbacks: readonly string[],
  call: (m: string) => Promise<T>,
  opts: { retries?: number; budgetMs?: number; baseDelayMs?: number; attemptMs?: number } = {},
): Promise<T> {
  const chain = [model, ...fallbacks.filter((m) => m !== model)];
  const retries = opts.retries ?? 2;
  const deadline = Date.now() + (opts.budgetMs ?? 130_000);
  // One slow model must not eat the whole budget: give up on it and fall back.
  const attemptMs = opts.attemptMs ?? 75_000;
  const base = opts.baseDelayMs ?? 700;
  let last: unknown;
  let busy: unknown;
  let quota: unknown;
  for (const m of chain) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await withTimeout(call(m), Math.min(attemptMs, Math.max(1_000, deadline - Date.now())));
      } catch (error) {
        last = error;
        if (isQuotaBlocked(error)) quota ??= error;
        if (isModelMissing(error) || isQuotaBlocked(error)) break;
        if (!isTransient(error)) throw error;
        busy = error;
        // Overloaded (503/high demand): another model is likelier to answer than
        // this one a second later, so move on immediately.
        if (/\b503\b|UNAVAILABLE|overloaded|high demand|timed out/i.test(errorText(error))) break;
        const wait = base * 2 ** attempt + Math.floor(Math.random() * 300);
        if (attempt === retries || Date.now() + wait > deadline) break;
        await sleep(wait);
      }
    }
    if (Date.now() > deadline) break;
  }
  // Prefer the most actionable cause: busy (retry helps) > quota > whatever came last.
  throw busy ?? quota ?? last;
}

/** Strip SDK failures to a safe message (never surfaces keys or payloads). */
function providerError(what: string, error: unknown): Error {
  // Server-side log for diagnosis (message only — never keys or payloads).
  console.error(`[gemini] ${what} failed:`, errorText(error).slice(0, 500));
  if (isQuotaBlocked(error)) {
    return new Error(
      `The generation service has no quota left for ${what}. Free-tier keys usually can't generate ${what === "image generation" ? "images" : "this"} Please try again later.`,
    );
  }
  if (isTransient(error)) {
    return new Error(
      `The generation service is very busy right now, so ${what} could not finish. We retried automatically on backup models — please try again in a minute.`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${what} failed: ${message.slice(0, 300)}`);
}

export class GeminiTextProvider implements TextProvider {
  readonly capability = "text" as const;
  readonly name = "gemini";

  async generateText(request: { prompt: string; maxTokens?: number; json?: boolean; skills?: SkillId[] }): Promise<{ text: string; model: string }> {
    if (!request.prompt.trim()) throw new Error("Text generation failed: prompt cannot be empty.");
    // Expert skills go first, so every model (and every backup) works to the same standard.
    const prompt = `${skillsFor(request.skills)}${request.prompt.trim()}`;
    const env = getServerEnv();
    const hasBackup = backupTextProviders(env).length > 0;
    // No Gemini key: use the other providers directly.
    if (!env.GEMINI_API_KEY && hasBackup) {
      try {
        return await backupText({ ...request, prompt }, env);
      } catch (error) {
        throw providerError("text generation", error);
      }
    }
    const model = env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
    // Floor of 256: reasoning models spend output budget on thought tokens,
    // so tiny caps would return empty text.
    // JSON replies get a generous budget: thinking tokens count against it, and
    // a cut-off reply is unusable.
    const requested =
      typeof request.maxTokens === "number" && Number.isFinite(request.maxTokens) ? Math.floor(request.maxTokens) : 2048;
    const maxOutputTokens = request.json ? Math.min(32768, Math.max(8192, requested * 3)) : Math.min(8192, Math.max(256, requested));
    try {
      const ai = getGeminiClient(env);
      const call = async (m: string) => {
        const response = await ai.models.generateContent({
          model: m,
          contents: prompt,
          config: {
            maxOutputTokens,
            temperature: 0.7,
            ...(request.json ? { responseMimeType: "application/json" } : {}),
          },
        });
        const text = response.text?.trim();
        if (!text) throw new Error("empty response");
        return { text, model: m };
      };
      // With backups available, give Gemini less time before handing over.
      const budget = hasBackup ? { budgetMs: 100_000, attemptMs: 60_000 } : {};
      const first = await withModelFallback(model, FALLBACK_MODELS.text, call, budget);
      if (!request.json || extractJsonObject(first.text)) return first;
      // One automatic retry when the JSON came back unreadable.
      const second = await withModelFallback(first.model, FALLBACK_MODELS.text, call, budget);
      if (extractJsonObject(second.text)) return second;
      if (hasBackup) return await backupText({ ...request, prompt }, env).catch(() => first);
      return first;
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError && !hasBackup) throw error;
      // Gemini busy, slow, out of quota or failing: hand over to Mistral, then NVIDIA.
      if (hasBackup) {
        try {
          return await backupText({ ...request, prompt }, env);
        } catch {
          // logged per provider; report the original Gemini problem
        }
      }
      throw providerError("text generation", error);
    }
  }
}

/** Backup image models when Gemini can't make the image: NVIDIA FLUX, then BytePlus Seedream. */
async function backupImage(prompt: string, aspect: "16:9" | "9:16" | "1:1"): Promise<string> {
  const env = getServerEnv();
  let last: unknown = new Error("No backup image model is configured.");
  if (isNvidiaImageConfigured(env)) {
    try {
      return (await nvidiaGenerateImage(prompt, aspect)).dataUrl;
    } catch (error) {
      last = error;
      console.error("[nvidia] image fallback failed:", error instanceof Error ? error.message.slice(0, 300) : error);
    }
  }
  if (isArkConfigured(env)) {
    try {
      return (await arkGenerateImage(cleanImagePrompt(prompt), aspect)).dataUrl;
    } catch (error) {
      console.error("[byteplus] image fallback failed:", error instanceof Error ? error.message.slice(0, 300) : error);
      // Keep a "filtered" reason from NVIDIA so the user gets the plain-words hint.
      if (!/filtered/i.test(last instanceof Error ? last.message : "")) last = error;
    }
  }
  throw last;
}

export class GeminiImageProvider implements ImageProvider {
  readonly capability = "image" as const;
  readonly name = "gemini";

  async generateImage(request: { prompt: string; aspectRatio?: string }): Promise<{ url: string; prompt: string }> {
    const prompt = cleanImagePrompt(request.prompt, 1800);
    if (!prompt) throw new Error("Image generation failed: prompt cannot be empty.");
    const env = getServerEnv();
    const model = env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
    const aspect = request.aspectRatio === "9:16" || request.aspectRatio === "1:1" ? request.aspectRatio : "16:9";
    const backups = isNvidiaImageConfigured(env) || isArkConfigured(env);
    // No Gemini key: the backup image models directly.
    if (!env.GEMINI_API_KEY && backups) {
      try {
        return { url: await backupImage(prompt, aspect), prompt: request.prompt };
      } catch (error) {
        throw providerError("image generation", error);
      }
    }
    try {
      const ai = getGeminiClient(env);
      const response = await withModelFallback(model, FALLBACK_MODELS.image, (m) =>
        ai.models.generateContent({
          model: m,
          contents: `Generate a ${aspect} aspect-ratio image: ${prompt}`,
          config: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      );
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData?.data);
      const data = imagePart?.inlineData?.data;
      const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";
      if (!data) throw new Error("empty response");
      // Data URL: renders directly and persists through existing asset flows
      // until object-storage upload lands on the media route.
      return { url: `data:${mimeType};base64,${data}`, prompt: request.prompt };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError && !backups) throw error;
      // Gemini out of image quota, busy or failing: the backup image models.
      if (backups) {
        try {
          return { url: await backupImage(prompt, aspect), prompt: request.prompt };
        } catch (backupError) {
          if (/filtered/i.test(backupError instanceof Error ? backupError.message : "")) {
            throw new Error("The image service declined this prompt. Describe the scene in plain words (subject, setting, mood) and try again.");
          }
        }
      }
      throw providerError("image generation", error);
    }
  }
}

/** Wrap mono 16-bit little-endian PCM (base64) in a WAV header. */
export function pcmToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

/** Longest text sent in one TTS call; longer narration is split and joined. */
const TTS_CHUNK_CHARS = 1400;
/**
 * Upper bound for one take: ~15 minutes of speech, which keeps the WAV
 * (24 kHz, 16-bit mono ≈ 2.9 MB/min) under the 50 MB storage object limit.
 * Longer videos are voiced scene by scene.
 */
export const TTS_MAX_CHARS = 14_000;
const VOXTRAL_CHUNK_CHARS = 450;

/** Seconds a piece of narration needs at a brisk speaking pace (~175 words/min). */
function minSpeechSec(text: string): number {
  return (text.split(/\s+/).filter(Boolean).length / 175) * 60;
}

/**
 * Voice one chunk and make sure every word was spoken: if the audio is far
 * shorter than the words need (the voice engine stopped early), split the
 * text in two and voice each half, down to single sentences.
 */
export async function completeSpeech(
  text: string,
  voiceIt: (t: string) => Promise<{ pcm: Buffer; rate: number }>,
  depth = 0,
): Promise<{ pcm: Buffer; rate: number }[]> {
  const part = await voiceIt(text);
  const got = part.pcm.length / 2 / part.rate;
  const need = minSpeechSec(text);
  if (need < 6 || got >= need * 0.6 || depth >= 4) return [part];
  const sentences = splitForSpeech(text, Math.max(80, Math.ceil(text.length / 2)));
  if (sentences.length < 2) return [part];
  console.error(`[tts] audio cut short (${got.toFixed(1)}s for ~${need.toFixed(0)}s of text); re-voicing in ${sentences.length} parts`);
  const out: { pcm: Buffer; rate: number }[] = [];
  for (const piece of sentences) out.push(...(await completeSpeech(piece, voiceIt, depth + 1)));
  return out;
}

/**
 * Split narration into chunks of at most `max` characters, breaking at
 * paragraph, then sentence, then word boundaries so no word is cut.
 */
export function splitForSpeech(text: string, max = TTS_CHUNK_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  const sentences = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .flatMap((para) => para.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [para]);
  for (const raw of sentences) {
    const sentence = raw.replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      push();
      for (const word of sentence.split(" ")) {
        if (cur && cur.length + word.length + 1 > max) push();
        cur = cur ? `${cur} ${word}` : word;
      }
      continue;
    }
    if (cur && cur.length + sentence.length + 1 > max) push();
    cur = cur ? `${cur} ${sentence}` : sentence;
  }
  push();
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class GeminiTtsProvider implements TtsProvider {
  readonly capability = "tts" as const;
  readonly name = "gemini";

  /** One TTS call; returns raw 16-bit mono PCM and its sample rate. */
  private async synthesizeChunk(text: string, voice: string, model: string): Promise<{ pcm: Buffer; rate: number }> {
    const ai = getGeminiClient();
    const response = await withModelFallback(model, FALLBACK_MODELS.tts, (m) =>
      ai.models.generateContent({
        model: m,
        contents: text,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    const data = audioPart?.inlineData?.data;
    if (!data) throw new Error("empty response");
    const mimeType = audioPart?.inlineData?.mimeType ?? "audio/pcm";
    if (!/pcm|L16/i.test(mimeType)) throw new Error(`unexpected audio format ${mimeType}`);
    return { pcm: Buffer.from(data, "base64"), rate: Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000) };
  }

  /**
   * Narration of any length: long text is split at sentence breaks, voiced
   * a few chunks at a time, and joined into one WAV with short pauses, so
   * nothing is cut off.
   */
  async synthesizeSpeech(request: {
    text: string;
    voice?: string;
  }): Promise<{ audioBase64: string; mimeType: string; model: string; durationSec: number }> {
    const text = request.text.trim();
    if (!text) throw new Error("Speech synthesis failed: text cannot be empty.");
    if (text.length > TTS_MAX_CHARS) throw new Error(`Speech synthesis failed: text exceeds ${TTS_MAX_CHARS} characters.`);
    const env = getServerEnv();
    const model = env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL;
    const voice = request.voice?.trim() || env.GEMINI_TTS_VOICE || DEFAULT_TTS_VOICE;
    const chunks = splitForSpeech(text);
    const mistral = isMistralConfigured(env);
    // One provider per take, so the voice never changes mid-narration.
    // Voxtral stops early on long inputs: shorter pieces, each checked.
    const viaMistral = async () => ({
      parts: (await mapLimit(splitForSpeech(text, VOXTRAL_CHUNK_CHARS), 3, (chunk) => completeSpeech(chunk, (t) => mistralSpeechChunk(t)))).flat(),
      model: "voxtral-mini-tts",
    });
    try {
      let result: { parts: { pcm: Buffer; rate: number }[]; model: string };
      if (!env.GEMINI_API_KEY && mistral) result = await viaMistral();
      else {
        try {
          result = { parts: (await mapLimit(chunks, 4, (chunk) => completeSpeech(chunk, (t) => this.synthesizeChunk(t, voice, model)))).flat(), model };
        } catch (error) {
          if (!mistral || (error instanceof ProviderNotConfiguredError && !mistral)) throw error;
          console.error("[gemini] speech failed, using Voxtral:", error instanceof Error ? error.message.slice(0, 200) : error);
          result = await viaMistral();
        }
      }
      const parts = result.parts;
      const rate = parts[0].rate;
      const pause = Buffer.alloc(Math.round(rate * 0.25) * 2); // 250 ms of silence between chunks
      const pcm = Buffer.concat(parts.flatMap((p, i) => (i < parts.length - 1 ? [p.pcm, pause] : [p.pcm])));
      return { audioBase64: pcmToWavBase64(pcm.toString("base64"), rate), mimeType: "audio/wav", model: result.model, durationSec: pcm.length / 2 / rate };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      throw providerError("speech synthesis", error);
    }
  }
}

/**
 * Register Gemini as the primary provider for text, image, and TTS.
 * No-op (returns []) when GEMINI_API_KEY is unset — the gateway keeps
 * throwing explicit boundary errors instead of fake responses.
 */
export function registerGeminiProviders(gateway: AIGateway = getGateway()): AICapability[] {
  if (!isGeminiConfigured()) return [];
  gateway.register(new GeminiTextProvider());
  gateway.register(new GeminiImageProvider());
  gateway.register(new GeminiTtsProvider());
  return ["text", "image", "tts"];
}

const TASK_LABELS: Record<string, string> = {
  "idea-analysis": "Analyze this video idea for clarity, curiosity, and audience fit.",
  "topic-discovery": "Suggest promising video topics and angles for this channel context.",
  "audience-analysis": "Profile the target audience: motivations, pains, and language.",
  "content-strategy": "Recommend a content strategy: pillars, formats, and cadence.",
  "competitive-analysis": "Assess the competitive landscape and differentiation openings.",
  "title-analysis": "Critique and improve these video titles for clarity and click-through honesty.",
  "hook-analysis": "Critique and improve these hooks and openers for retention.",
  "retention-analysis": "Identify retention risks and suggest pacing improvements.",
  "content-gap-analysis": "Find content gaps: unanswered questions and uncovered angles.",
  "brief-generation": "Write a concise production brief from this context.",
  "thumbnail-concepts": "Propose 4 distinct YouTube thumbnail concepts. For each: focal subject, facial emotion or object, 2-4 word text overlay, color/contrast plan, composition, and why it earns the click honestly. End each with a one-line image-generation prompt prefixed 'PROMPT:'. Keep each concept under 90 words.",
  "repurpose-plan": "Repurpose this video into ready-to-post pieces: 3 short-form clip scripts (hook, beats, on-screen text, CTA), one X/Twitter thread, one LinkedIn post, and one community post. Write the final copy, not advice.",
  "platform-copy": "Write publish-ready copy for each platform listed (default: YouTube, YouTube Shorts, TikTok, Instagram Reels, X, LinkedIn): title or first line, caption/description within that platform's limits, and 3-8 relevant hashtags. Label each platform clearly.",
  "storyboard-plan": "Create a shot-by-shot storyboard for these scenes: for each scene list shots with visual description, camera framing/motion, b-roll ideas, on-screen text, sound/music cue, and transition. Keep it filmable on a creator budget.",
};

export interface IntelligenceResponse {
  task: string;
  text: string;
  model: string;
}

/**
 * Execute an intelligence task through Gemini. Throws
 * IntelligenceNotConfiguredError when GEMINI_API_KEY is unset, so the UI
 * keeps running deterministic local analyzers labeled "Local analysis".
 */
export async function runIntelligenceTask(request: IntelligenceRequest): Promise<IntelligenceResponse> {
  if (!isTextConfigured()) throw new IntelligenceNotConfiguredError(request.task);
  const label = TASK_LABELS[request.task] ?? `Perform the "${request.task}" analysis.`;
  const context = JSON.stringify(request.context ?? {}).slice(0, 8000);
  const provider = new GeminiTextProvider();
  const { text, model } = await provider.generateText({
    skills: skillsForTask(request.task),
    prompt: `You are TubeRack's YouTube strategy analyst. ${label}\nContext (JSON):\n${context}\n\nRules: respond in plain text with concrete, actionable reasoning. Never invent views, rankings, metrics, or channel data — reason only from the context given.`,
    maxTokens: 4096,
  });
  return { task: request.task, text, model };
}

/** Resolved model info for usage records. Null until GEMINI_API_KEY is set. */
export function currentGeminiModel(): { provider: string; model: string } | null {
  if (!isGeminiConfigured()) return null;
  return { provider: "gemini", model: getGeminiModels().text };
}

export interface ScriptWriteRequest {
  topic: string;
  audience: string;
  format: string;
  tone: string;
  complexity: string;
  structure: string;
  targetWords: number;
  instruction: string;
  hookText: string;
  promiseText: string;
  takeawayText: string;
  points: string[];
  ctaText: string;
  sections: { type: string; heading: string }[];
}

/**
 * Write every section of a script in one call. Returns section texts in the
 * same order as requested; throws when the model output is not the agreed
 * JSON shape (never silently pads missing sections).
 */
export async function writeScriptSections(req: ScriptWriteRequest): Promise<{ texts: string[]; model: string }> {
  if (!isTextConfigured()) throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  const perSection = Math.max(40, Math.round(req.targetWords / Math.max(1, req.sections.length)));
  const brief = {
    topic: req.topic,
    audience: req.audience,
    format: req.format,
    tone: req.tone,
    complexity: req.complexity,
    structure: req.structure,
    approvedHook: req.hookText,
    promise: req.promiseText,
    keyTakeaway: req.takeawayText,
    points: req.points.slice(0, 12),
    callToAction: req.ctaText,
    creatorInstruction: req.instruction,
  };
  const outline = req.sections.map((s, i) => `${i + 1}. ${s.heading} (${s.type})`).join("\n");
  const prompt = [
    "You are an expert YouTube scriptwriter. Write the spoken narration for each section below.",
    `Brief (JSON): ${JSON.stringify(brief).slice(0, 6000)}`,
    `Sections, in order:\n${outline}`,
    `Aim for about ${perSection} words per section (~${req.targetWords} words total). Write natural spoken language for the stated tone and audience.`,
    "If an approved hook is given, use it (lightly polished) as the hook section.",
    "Never invent statistics, studies, quotes, or view counts; where a fact is needed, write [FACT CHECK: what to verify].",
    `Respond ONLY with JSON: {"sections": ["text for section 1", ...]} containing exactly ${req.sections.length} strings.`,
  ].join("\n\n");
  const { text, model } = await new GeminiTextProvider().generateText({
    skills: ["content", "youtube", "copy"],
    prompt,
    maxTokens: Math.min(8192, Math.round(req.targetWords * 2.5) + 1024),
    json: true,
  });
  const parsed: unknown = parseJsonObject(text, "script generation");
  const list = (parsed as { sections?: unknown }).sections;
  if (!Array.isArray(list) || list.length !== req.sections.length || !list.every((t) => typeof t === "string")) {
    throw new Error("Script generation failed: section count did not match. Try again.");
  }
  return { texts: (list as string[]).map((t) => stripMarkdown(t)), model };
}

function parseJsonObject(text: string, what: string): Record<string, unknown> {
  const obj = extractJsonObject(text);
  if (obj) return obj;
  throw new Error(`${what} failed: the reply couldn't be read. Please try again.`);
}

const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max) : [];

/** Packaging helpers: title options, or an SEO description + tags + hashtags. */
export async function writePackaging(
  kind: "titles" | "seo",
  context: {
    topic: string;
    audience: string;
    promise: string;
    takeaway: string;
    cta: string;
    title: string;
    script: string;
    chapters: string;
    channel?: string;
    brief?: string;
    hook?: string;
    format?: string;
    durationSec?: number;
  },
): Promise<{ titles?: { text: string; category: string }[]; description?: string; tags?: string[]; hashtags?: string[]; model: string }> {
  if (!isTextConfigured()) throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  const brief = JSON.stringify({ ...context, script: context.script.slice(0, 5000) });
  const rules =
    "Base everything on what the video actually says (script) and who it is for. Never invent statistics, rankings, or view counts. " +
    "No clickbait the video does not deliver — over-promising kills retention and hurts reach." +
    (context.format === "Short" ? " This is a YouTube Short: keep it punchy and mobile-first." : "");
  if (kind === "titles") {
    const { text, model } = await new GeminiTextProvider().generateText({
    skills: ["youtube", "copy", "marketing"],
      prompt: `You are a YouTube growth strategist who writes titles that earn clicks from the right viewers. Write 8 distinct title options for this video, one per category: Curiosity, Benefit, Story, Question, Specific outcome, Contrarian, Educational, Search. Each: under 60 characters where possible (70 max), the main searchable keyword near the front, a clear payoff or open loop, and it must match the video's real hook and promise. The Search option is what someone would type into YouTube.\n${rules}\nVideo (JSON): ${brief}\nRespond ONLY with JSON: {"titles":[{"text":"...","category":"..."}]}`,
      maxTokens: 1500,
      json: true,
    });
    const obj = parseJsonObject(text, "title generation");
    const titles = (Array.isArray(obj.titles) ? obj.titles : [])
      .map((t) => t as { text?: unknown; category?: unknown })
      .filter((t) => typeof t.text === "string" && t.text.trim())
      .map((t) => ({ text: String(t.text).trim().slice(0, 100), category: typeof t.category === "string" ? t.category : "Curiosity" }))
      .slice(0, 10);
    if (titles.length === 0) throw new Error("Title generation failed: no titles returned. Try again.");
    return { titles, model };
  }
  const { text, model } = await new GeminiTextProvider().generateText({
    skills: ["youtube", "copy", "marketing"],
    prompt: `You are a YouTube growth strategist. Write the upload copy that helps this video get discovered and watched. Description (150-300 words): the first two lines (shown in search and above "more") must hook the viewer and contain the main keyword naturally; then 2-3 short lines on what they'll learn or feel, using the words people search for; then the chapters exactly as given (if any); then a call to action that names the channel (subscribe / watch next). Also give 12-15 tags ordered from exact topic phrases to broader related searches (no channel-spam, no misleading tags), and 3 relevant hashtags.\n${rules}\nVideo (JSON): ${brief}\nRespond ONLY with JSON: {"description":"...","tags":["..."],"hashtags":["#..."]}`,
    maxTokens: 2000,
    json: true,
  });
  const obj = parseJsonObject(text, "SEO generation");
  if (typeof obj.description !== "string" || !obj.description.trim()) {
    throw new Error("SEO generation failed: no description returned. Try again.");
  }
  return {
    description: obj.description.trim(),
    tags: strings(obj.tags, 20),
    hashtags: strings(obj.hashtags, 5).map((h) => (h.startsWith("#") ? h : `#${h}`)),
    model,
  };
}

/** Rewrite one script section following a creator instruction. */
export async function rewriteSection(input: {
  heading: string;
  text: string;
  instruction: string;
  topic: string;
}): Promise<{ text: string; model: string }> {
  if (!isTextConfigured()) throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  const { text, model } = await new GeminiTextProvider().generateText({
    skills: ["content", "copy"],
    prompt: [
      "You are an expert YouTube scriptwriter. Rewrite the script section below as spoken narration.",
      `Video topic: ${input.topic || "(not given)"}`,
      `Section: ${input.heading}`,
      `Creator instruction: ${input.instruction || "Make it tighter, clearer, and more engaging while keeping the meaning."}`,
      "Keep facts as given; never invent statistics or quotes. Return ONLY the rewritten section text, no headings or notes.",
      `Original:\n${input.text}`,
    ].join("\n\n"),
    maxTokens: Math.min(4096, Math.round(input.text.split(/\s+/).length * 3) + 512),
  });
  return { text: stripMarkdown(text.replace(/^["“]|["”]$/g, "").trim()), model };
}

export interface TimedSegment {
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Transcribe speech with Gemini (audio understanding) into timed caption
 * segments. Timings come from the model; they are validated, sorted, and
 * clamped — segments that are not well-formed are dropped, never invented.
 */
/** Length of a WAV file in seconds from its header (null for other formats). */
export function wavDurationSec(bytes: Uint8Array): number | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = b.readUInt32LE(off + 16);
    if (id === "data") return byteRate > 0 ? Math.min(size, b.length - off - 8) / byteRate : null;
    off += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Captions must follow the audio: sorted, never overlapping, inside the take.
 * Returns null when the timings clearly don't cover the audio (a model that
 * squeezed or cut them short), so the caller can try another route.
 */
export function tidySegments(segments: TimedSegment[], durationSec: number | null): TimedSegment[] | null {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const out: TimedSegment[] = [];
  for (const s of sorted) {
    const prevEnd = out.length ? out[out.length - 1].endSec : 0;
    const start = Math.max(s.startSec, prevEnd);
    let end = durationSec ? Math.min(s.endSec, durationSec) : s.endSec;
    if (end - start < 0.3) end = start + 0.3;
    if (durationSec && start >= durationSec) break;
    out.push({ startSec: Math.round(start * 100) / 100, endSec: Math.round(end * 100) / 100, text: s.text });
  }
  if (out.length === 0) return null;
  if (durationSec && durationSec > 15 && out[out.length - 1].endSec < durationSec * 0.75) return null;
  return out;
}

/** Last resort: the words spread across the take by word count (always in order, full length). */
export function spreadText(text: string, durationSec: number, maxWords = 8): TimedSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || durationSec <= 0) return [];
  const per = durationSec / words.length;
  const out: TimedSegment[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const n = Math.min(maxWords, words.length - i);
    out.push({ startSec: Math.round(i * per * 100) / 100, endSec: Math.round((i + n) * per * 100) / 100, text: words.slice(i, i + n).join(" ") });
  }
  return out;
}

/**
 * Timed captions for a voice take. Speech recognition (Voxtral) gives real
 * timestamps, so it goes first; Gemini is the backup. Every result is checked
 * against the audio's true length before it is used.
 */
export async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<{ text: string; segments: TimedSegment[]; model: string }> {
  if (bytes.byteLength === 0) throw new Error("Transcription failed: audio is empty.");
  const duration = wavDurationSec(bytes);
  let bestText = "";
  let lastError: unknown = null;
  const routes: (() => Promise<{ text: string; segments: TimedSegment[]; model: string }>)[] = [];
  if (isMistralConfigured()) routes.push(() => mistralTranscribe(bytes, mimeType));
  if (isGeminiConfigured()) routes.push(() => geminiTranscribe(bytes, mimeType));
  if (routes.length === 0) throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  for (const route of routes) {
    try {
      const r = await route();
      if (r.text.length > bestText.length) bestText = r.text;
      const tidy = tidySegments(r.segments, duration);
      if (tidy) return { text: r.text, segments: tidy, model: r.model };
      console.error("[captions] timings did not cover the audio; trying the next route");
    } catch (error) {
      lastError = error;
      console.error("[captions] transcription route failed:", error instanceof Error ? error.message.slice(0, 200) : error);
    }
  }
  if (bestText && duration) return { text: bestText, segments: spreadText(bestText, duration), model: "estimated" };
  throw providerError("transcription", lastError ?? new Error("no usable captions"));
}

async function geminiTranscribe(bytes: Uint8Array, mimeType: string): Promise<{ text: string; segments: TimedSegment[]; model: string }> {
  if (bytes.byteLength === 0) throw new Error("Transcription failed: audio is empty.");
  if (!isGeminiConfigured()) throw new ProviderNotConfiguredError("text", "Generation is not configured.");
  const env = getServerEnv();
  const model = env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
  const ai = getGeminiClient(env);
  const prompt =
    "Transcribe this narration exactly. Split it into caption lines of at most about 8 words, each with its start and end time in seconds from the start of the audio. " +
    'Respond ONLY with JSON: {"segments":[{"start":0.0,"end":2.4,"text":"..."}]}';
  try {
    const response = await withModelFallback(model, FALLBACK_MODELS.text, (m) =>
      ai.models.generateContent({
        model: m,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }, { text: prompt }],
          },
        ],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192, temperature: 0 },
      }),
    );
    const raw = response.text?.trim() ?? "";
    const obj = parseJsonObject(raw, "transcription");
    const list = Array.isArray(obj.segments) ? obj.segments : [];
    const segments: TimedSegment[] = list
      .map((s) => s as { start?: unknown; end?: unknown; text?: unknown })
      .map((s) => ({ startSec: Number(s.start), endSec: Number(s.end), text: typeof s.text === "string" ? s.text.trim() : "" }))
      .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec && s.startSec >= 0 && s.text)
      .sort((a, b) => a.startSec - b.startSec)
      .slice(0, 2000);
    if (segments.length === 0) throw new Error("no timed segments returned");
    return { text: segments.map((s) => s.text).join(" "), segments, model };
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) throw error;
    throw error;
  }
}

export interface NicheCandidate {
  name: string;
  query: string;
  angle: string;
  audience: string;
}

/** Expand a seed interest into distinct, searchable YouTube niches. */
export async function expandNiches(input: { seed: string; audience: string; count: number }): Promise<{ niches: NicheCandidate[]; model: string }> {
  const provider = new GeminiTextProvider();
  const { text, model } = await provider.generateText({
    skills: ["youtube", "marketing", "influencer"],
    prompt:
      `You are a YouTube niche researcher. Seed interest: "${input.seed.slice(0, 200)}".` +
      (input.audience ? ` Target audience: "${input.audience.slice(0, 200)}".` : "") +
      ` Propose ${input.count} DISTINCT sub-niches a new creator could own — mix broad and specific, avoid near-duplicates.` +
      ` For each give: name (2-5 words), query (the exact 2-6 word phrase viewers type into YouTube search), angle (one sentence on the unique positioning), audience (who watches).` +
      ` Respond ONLY with JSON: {"niches":[{"name":"","query":"","angle":"","audience":""}]}`,
    maxTokens: 1500,
    json: true,
  });
  const obj = parseJsonObject(text, "niche ideas");
  const list = Array.isArray(obj.niches) ? (obj.niches as Record<string, unknown>[]) : [];
  const niches = list
    .map((n) => ({
      name: String(n.name ?? "").trim().slice(0, 80),
      query: String(n.query ?? n.name ?? "").trim().slice(0, 120),
      angle: String(n.angle ?? "").trim().slice(0, 300),
      audience: String(n.audience ?? "").trim().slice(0, 200),
    }))
    .filter((n) => n.name && n.query)
    .slice(0, input.count);
  if (niches.length === 0) throw new Error("Niche ideas failed: no usable niches returned. Try again.");
  return { niches, model };
}

export type { NicheReport } from "@/src/lib/niche/score";
import type { NicheReport } from "@/src/lib/niche/score";

/** Deep-dive plan for one niche, grounded in its measured YouTube metrics. */
export async function writeNicheReport(input: {
  name: string;
  query: string;
  angle: string;
  metrics: Record<string, unknown>;
  scores: Record<string, unknown>;
  topTitles: string[];
}): Promise<{ report: NicheReport; model: string }> {
  const provider = new GeminiTextProvider();
  const { text, model } = await provider.generateText({
    skills: ["youtube", "marketing", "product"],
    prompt:
      `You are a YouTube strategist. Build a launch plan for the niche "${input.name}" (search phrase "${input.query}"; angle: ${input.angle || "—"}).\n` +
      `Measured from live YouTube data (last 180 days, top videos by views): ${JSON.stringify(input.metrics)}\nScores (0-100): ${JSON.stringify(input.scores)}\n` +
      `Top-performing titles right now:\n- ${input.topTitles.slice(0, 12).join("\n- ")}\n\n` +
      `Use ONLY these numbers; never invent statistics, RPMs, or earnings figures. Respond ONLY with JSON: ` +
      `{"summary":"2-3 sentence verdict referencing the metrics","audience":"who they are and what they want","pillars":["4 content pillars"],` +
      `"videoIdeas":[{"title":"","hook":"first line spoken","format":"long-form|short|series"}] (10 ideas that beat the current top titles),` +
      `"monetization":["4-6 revenue paths suited to this audience, no figures"],"risks":["3-5 risks"],"firstWeekPlan":["5-7 concrete steps"]}`,
    maxTokens: 3500,
    json: true,
  });
  const o = parseJsonObject(text, "niche report");
  const ideas = Array.isArray(o.videoIdeas) ? (o.videoIdeas as Record<string, unknown>[]) : [];
  return {
    model,
    report: {
      summary: String(o.summary ?? "").trim(),
      audience: String(o.audience ?? "").trim(),
      pillars: strings(o.pillars, 6),
      videoIdeas: ideas
        .map((i) => ({ title: String(i.title ?? "").trim(), hook: String(i.hook ?? "").trim(), format: String(i.format ?? "").trim() }))
        .filter((i) => i.title)
        .slice(0, 12),
      monetization: strings(o.monetization, 8),
      risks: strings(o.risks, 6),
      firstWeekPlan: strings(o.firstWeekPlan, 8),
    },
  };
}

export interface ThumbnailScore {
  index: number;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

/** Gemini vision review of thumbnail variants for one title (predicted, labeled as such). */
export async function scoreThumbnails(title: string, images: { mime: string; base64: string }[]): Promise<{ scores: ThumbnailScore[]; pick: number; reasoning: string; model: string }> {
  if (!isGeminiConfigured()) throw new IntelligenceNotConfiguredError("title-analysis");
  const ai = getGeminiClient();
  const model = getGeminiModels().text;
  try {
    const response = await withModelFallback(model, FALLBACK_MODELS.text, (m) =>
      ai.models.generateContent({
        model: m,
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `You review YouTube thumbnails for the video "${title.slice(0, 150)}". Images are numbered 0..${images.length - 1} in order. ` +
                  `Judge each for mobile legibility, focal subject, contrast, emotion, curiosity, and honesty vs the title. ` +
                  `Respond ONLY with JSON: {"scores":[{"index":0,"score":0-100,"strengths":["..."],"weaknesses":["..."]}],"pick":index,"reasoning":"one paragraph"}`,
              },
              ...images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.base64 } })),
            ],
          },
        ],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192, temperature: 0.2 },
      }),
    );
    const o = parseJsonObject(response.text?.trim() ?? "", "thumbnail review");
    const scores = (Array.isArray(o.scores) ? (o.scores as Record<string, unknown>[]) : [])
      .map((s) => ({ index: Number(s.index), score: Math.max(0, Math.min(100, Number(s.score) || 0)), strengths: strings(s.strengths, 4), weaknesses: strings(s.weaknesses, 4) }))
      .filter((s) => Number.isInteger(s.index) && s.index >= 0 && s.index < images.length);
    return { scores, pick: Number(o.pick ?? 0), reasoning: String(o.reasoning ?? ""), model };
  } catch (error) {
    throw providerError("thumbnail review", error);
  }
}

export interface PlannedItem {
  title: string;
  kind: "idea" | "script" | "record" | "edit" | "thumbnail" | "publish" | "promote";
  dayOffset: number;
  notes: string;
}

/** Gemini production schedule: per video, the stages leading up to each publish day. */
export async function planCalendar(input: { topic: string; audience: string; weeks: number; perWeek: number; publishDays: string[] }): Promise<{ items: PlannedItem[]; model: string }> {
  const provider = new GeminiTextProvider();
  const total = input.weeks * input.perWeek;
  const { text, model } = await provider.generateText({
    skills: ["youtube", "content", "influencer"],
    prompt:
      `Plan a YouTube content calendar for the niche/topic "${input.topic.slice(0, 200)}"` +
      (input.audience ? ` for ${input.audience.slice(0, 150)}` : "") +
      `. ${total} videos over ${input.weeks} weeks (${input.perWeek}/week), publishing on ${input.publishDays.join(", ") || "any day"}. ` +
      `For EACH video create 5 items: script, record, edit, thumbnail, publish — scheduled before its publish day (script ~5 days before, record ~3, edit ~2, thumbnail ~1). ` +
      `dayOffset = days from the start date (0 = start). Video titles must be specific and clickable, and build on each other (series, pillars). ` +
      `Respond ONLY with JSON: {"items":[{"title":"Video title — stage detail","kind":"script|record|edit|thumbnail|publish","dayOffset":0,"notes":"one line"}]}`,
    maxTokens: 6000,
    json: true,
  });
  const o = parseJsonObject(text, "calendar plan");
  const kinds = ["idea", "script", "record", "edit", "thumbnail", "publish", "promote"];
  const items = (Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [])
    .map((i) => ({
      title: String(i.title ?? "").trim().slice(0, 200),
      kind: (kinds.includes(String(i.kind)) ? String(i.kind) : "publish") as PlannedItem["kind"],
      dayOffset: Math.max(0, Math.min(input.weeks * 7 + 7, Math.round(Number(i.dayOffset) || 0))),
      notes: String(i.notes ?? "").trim().slice(0, 300),
    }))
    .filter((i) => i.title)
    .slice(0, 200);
  if (!items.length) throw new Error("Calendar plan failed: no items returned. Try again.");
  return { items, model };
}

/** Full channel strategy, grounded in measured market data and real competitors. */
export async function writeChannelPlan(input: ChannelInputs, evidence: ChannelEvidence): Promise<{ plan: ChannelPlan; model: string }> {
  const provider = new GeminiTextProvider();
  const m = evidence.market;
  const facts = [
    m
      ? `Measured YouTube market data${input.region ? ` (${input.region})` : ""}, top videos of the last 180 days: median ${m.medianViewsPerDay} views/day; ` +
        `${Math.round(m.sponsoredShare * 100)}% carry sponsorships, ${Math.round(m.affiliateShare * 100)}% use affiliate links, ${Math.round(m.digitalShare * 100)}% sell their own products; ` +
        `long-form median ${m.longViewsPerDay ?? "n/a"} views/day (typical length ${m.medianLongMinutes ?? "n/a"} min), Shorts median ${m.shortsViewsPerDay ?? "n/a"} views/day. ` +
        `Advertiser category: ${m.category} (tier ${m.tier}/5, an industry estimate). Best-performing titles: ${m.topTitles.slice(0, 12).map((t) => `"${t}"`).join("; ")}.`
      : "No market scan was available.",
    evidence.competitors.length
      ? `Competitor channels (live data): ${evidence.competitors
          .map((c) => `${c.title} — ${c.subscribers ?? "hidden"} subscribers, ${c.videos ?? "?"} videos, median recent views ${c.medianViews ?? "n/a"}; recent titles: ${c.recentTitles.slice(0, 6).map((t) => `"${t}"`).join("; ")}`)
          .join(" | ")}`
      : "No competitor channels were supplied.",
  ].join("\n");
  const prompt =
    `You are a senior YouTube channel strategist writing a launch plan a professional agency would hand to a client.\n` +
    `Niche: ${input.niche}. Search phrase: ${input.query}. Target audience: ${input.audience || "not specified — infer from the data"}. Country/market: ${input.region || "worldwide"}.\n` +
    `Content type: ${input.contentType}. Platform: ${input.platform}. Channel style: ${input.style || "not specified"}.` +
    (input.brandName ? ` Name to build on: ${input.brandName}.` : "") +
    `\n\nEvidence (the only numbers you may cite):\n${facts}\n\n` +
    `Rules: be specific to this niche and audience; short, concrete sentences; no filler, no hype, no emojis, no markdown. ` +
    `Never invent statistics, earnings, or percentages — only cite numbers from the evidence. ` +
    `Differentiate from the competitors using their titles. Ideas must be distinct, searchable, and doable for a ${input.contentType} channel. ` +
    `The About text must be ready to paste into YouTube (max 1000 characters, first two lines carry the promise and keywords). ` +
    `Handles: 3-30 characters, letters/numbers/periods/underscores/hyphens only, without @.\n\n` +
    `Respond ONLY with JSON of this shape:\n` +
    `{"names":[{"name":"","why":""}] (6),"handles":[""] (8),"positioning":"","tagline":"","about":"",` +
    `"brand":{"voice":"","visualStyle":"","colors":["#hex"],"typography":"","dos":[""],"donts":[""]},` +
    `"audience":{"primary":"","painPoints":[""],"goals":[""],"watchContext":""},` +
    `"pillars":[{"name":"","purpose":"","share":0}] (3-5, shares sum to 100),"categories":[""],` +
    `"formats":[{"name":"","length":"","cadence":"","why":""}] (3-5),` +
    `"ideas":[{"title":"","pillar":"","format":"","hook":"","angle":""}] (exactly 30),"titlePatterns":[""] (10),` +
    `"thumbnail":{"style":"","rules":[""]},"publishing":{"cadence":"","days":[""],"time":"","first90Days":[""]},` +
    `"monetisation":[{"stage":"","actions":[""]}] (3 stages from launch to established),` +
    `"competitors":[{"name":"","strength":"","gap":""}],"seoKeywords":[""] (20),"channelKeywords":[""] (12),"launchChecklist":[""] (10-12)}`;
  const { text, model } = await provider.generateText({
    skills: ["youtube", "marketing", "influencer", "product"], prompt, maxTokens: 8192, json: true });
  const plan = normalisePlan(parseJsonObject(text, "channel plan"));
  if (plan.names.length === 0 || plan.ideas.length < 10) throw new Error("Received an incomplete channel plan. Try again.");
  return { plan, model };
}

export interface SceneVisual {
  visual: string;
  onScreenText: string;
}

/** Shot list for auto-video: one concrete image prompt + short on-screen text per scene. */
export async function planSceneVisuals(input: { topic: string; aspect: "16:9" | "9:16"; style: string; brief?: string; scenes: { title: string; text: string; direction?: string }[] }): Promise<{ visuals: SceneVisual[]; model: string }> {
  const provider = new GeminiTextProvider();
  const list = input.scenes
    .map((s, i) => `${i + 1}. [${s.title}] ${s.text.slice(0, 600)}${s.direction ? ` (storyboard direction: ${s.direction.slice(0, 200)})` : ""}`)
    .join("\n");
  const { text, model } = await provider.generateText({
    skills: ["content"],
    prompt:
      `You are the art director for a YouTube video about "${input.topic.slice(0, 200)}". Frame: ${input.aspect}.` +
      (input.style ? ` Visual style: ${input.style.slice(0, 200)}.` : "") +
      (input.brief ? `\nProduction brief (every image must fit it): ${input.brief.slice(0, 1200)}` : "") +
      `\nFor each scene below write: visual — one concrete, photographic image prompt (subject, setting, composition, lighting) that shows exactly what that scene's narration is about, for this video's audience; follow the storyboard direction when given; ` +
      `keep a consistent look across scenes; NO text, letters, logos or watermarks in the image. onScreenText — at most 6 words to overlay, or "" if none is needed.\n` +
      `Scenes:\n${list}\n\nRespond ONLY with JSON: {"scenes":[{"visual":"","onScreenText":""}]} with exactly ${input.scenes.length} items in order.`,
    maxTokens: 3000,
    json: true,
  });
  const obj = parseJsonObject(text, "scene visuals");
  const arr = Array.isArray(obj.scenes) ? (obj.scenes as Record<string, unknown>[]) : [];
  const visuals = input.scenes.map((s, i) => ({
    visual: String(arr[i]?.visual ?? "").trim().slice(0, 800) || `${s.title} — ${input.topic}`,
    onScreenText: String(arr[i]?.onScreenText ?? "").trim().slice(0, 60),
  }));
  return { visuals, model };
}
