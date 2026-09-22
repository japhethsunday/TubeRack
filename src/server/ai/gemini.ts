import { GoogleGenAI } from "@google/genai";
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

const DEFAULT_TEXT_MODEL = "gemini-3.6-flash";
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
    throw new ProviderNotConfiguredError("text", "Set GEMINI_API_KEY to enable Gemini.");
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

/** Strip SDK failures to a safe message (never surfaces keys or payloads). */
function providerError(what: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Gemini ${what} failed: ${message.slice(0, 300)}`);
}

export class GeminiTextProvider implements TextProvider {
  readonly capability = "text" as const;
  readonly name = "gemini";

  async generateText(request: { prompt: string; maxTokens?: number }): Promise<{ text: string; model: string }> {
    const prompt = request.prompt.trim();
    if (!prompt) throw new Error("Gemini text generation failed: prompt cannot be empty.");
    const env = getServerEnv();
    const model = env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
    // Floor of 256: reasoning models spend output budget on thought tokens,
    // so tiny caps would return empty text.
    const maxOutputTokens =
      typeof request.maxTokens === "number" && Number.isFinite(request.maxTokens)
        ? Math.min(8192, Math.max(256, Math.floor(request.maxTokens)))
        : 2048;
    try {
      const ai = getGeminiClient(env);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { maxOutputTokens, temperature: 0.7 },
      });
      const text = response.text?.trim();
      if (!text) throw new Error("empty response");
      return { text, model };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      throw providerError("text generation", error);
    }
  }
}

export class GeminiImageProvider implements ImageProvider {
  readonly capability = "image" as const;
  readonly name = "gemini";

  async generateImage(request: { prompt: string; aspectRatio?: string }): Promise<{ url: string; prompt: string }> {
    const prompt = request.prompt.trim();
    if (!prompt) throw new Error("Gemini image generation failed: prompt cannot be empty.");
    const env = getServerEnv();
    const model = env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
    const aspect = request.aspectRatio === "9:16" || request.aspectRatio === "1:1" ? request.aspectRatio : "16:9";
    try {
      const ai = getGeminiClient(env);
      const response = await ai.models.generateContent({
        model,
        contents: `Generate a ${aspect} aspect-ratio image: ${prompt}`,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData?.data);
      const data = imagePart?.inlineData?.data;
      const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";
      if (!data) throw new Error("empty response");
      // Data URL: renders directly and persists through existing asset flows
      // until object-storage upload lands on the media route.
      return { url: `data:${mimeType};base64,${data}`, prompt: request.prompt };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      throw providerError("image generation", error);
    }
  }
}

export class GeminiTtsProvider implements TtsProvider {
  readonly capability = "tts" as const;
  readonly name = "gemini";

  async synthesizeSpeech(request: {
    text: string;
    voice?: string;
  }): Promise<{ audioBase64: string; mimeType: string; model: string }> {
    const text = request.text.trim();
    if (!text) throw new Error("Gemini speech synthesis failed: text cannot be empty.");
    if (text.length > 5000) throw new Error("Gemini speech synthesis failed: text exceeds 5000 characters.");
    const env = getServerEnv();
    const model = env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL;
    const voice = request.voice?.trim() || env.GEMINI_TTS_VOICE || DEFAULT_TTS_VOICE;
    try {
      const ai = getGeminiClient(env);
      const response = await ai.models.generateContent({
        model,
        contents: text,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p) => p.inlineData?.data);
      const data = audioPart?.inlineData?.data;
      if (!data) throw new Error("empty response");
      return { audioBase64: data, mimeType: audioPart?.inlineData?.mimeType ?? "audio/pcm", model };
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
  if (!isGeminiConfigured()) throw new IntelligenceNotConfiguredError(request.task);
  const label = TASK_LABELS[request.task] ?? `Perform the "${request.task}" analysis.`;
  const context = JSON.stringify(request.context ?? {}).slice(0, 8000);
  const provider = new GeminiTextProvider();
  const { text, model } = await provider.generateText({
    prompt: `You are TubeRack's YouTube strategy analyst. ${label}\nContext (JSON):\n${context}\n\nRules: respond in plain text with concrete, actionable reasoning. Never invent views, rankings, metrics, or channel data — reason only from the context given.`,
    maxTokens: 2000,
  });
  return { task: request.task, text, model };
}

/** Resolved model info for usage records. Null until GEMINI_API_KEY is set. */
export function currentGeminiModel(): { provider: string; model: string } | null {
  if (!isGeminiConfigured()) return null;
  return { provider: "gemini", model: getGeminiModels().text };
}
