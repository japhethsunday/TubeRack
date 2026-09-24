"use client";

import { api, ApiError } from "@/src/lib/api";
import type { IntelligenceTaskType } from "@/src/lib/intelligence/tasks";

/**
 * Browser-side calls to the provider routes. Every call resolves to a
 * discriminated result instead of throwing, so studios can keep their
 * local output and explain exactly why provider output is missing.
 */

export type ProviderOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "signed-out" | "not-configured" | "rate-limited" | "offline" | "failed"; message: string };

function toOutcome(error: unknown): ProviderOutcome<never> {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHORIZED") return { ok: false, reason: "signed-out", message: "Sign in to use Gemini and YouTube." };
    if (error.code === "BACKEND_UNAVAILABLE") return { ok: false, reason: "not-configured", message: error.message };
    if (error.code === "RATE_LIMITED") return { ok: false, reason: "rate-limited", message: error.message };
    if (error.code === "NETWORK_ERROR") return { ok: false, reason: "offline", message: error.message };
    return { ok: false, reason: "failed", message: error.message };
  }
  return { ok: false, reason: "failed", message: error instanceof Error ? error.message : "Request failed." };
}

async function attempt<T>(call: () => Promise<T>): Promise<ProviderOutcome<T>> {
  try {
    return { ok: true, data: await call() };
  } catch (error) {
    return toOutcome(error);
  }
}

export interface IntelligenceResult {
  task: string;
  text: string;
  model: string;
}

export function runProviderIntelligence(task: IntelligenceTaskType, context: Record<string, unknown>) {
  return attempt(() => api.post<IntelligenceResult>("/api/v1/ai/intelligence", { task, context }));
}

export function generateProviderImage(prompt: string, aspectRatio: "16:9" | "9:16" | "1:1" = "16:9") {
  return attempt(() => api.post<{ url: string; prompt: string }>("/api/v1/ai/image", { prompt, aspectRatio }));
}

export function synthesizeProviderSpeech(text: string, voice?: string) {
  return attempt(() =>
    api.post<{ url: string; mimeType: string; model: string }>("/api/v1/ai/speech", { text, voice }),
  );
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  description: string;
  thumbnail: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export function searchYouTube(query: string, limit = 10) {
  return attempt(() =>
    api.get<{ query: string; results: YouTubeSearchResult[] }>(
      `/api/v1/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  );
}

export interface VideoSnapshot {
  kind: "video" | "channel";
  externalId: string;
  title: string;
  fetchedAt: string;
  metrics?: Record<string, number>;
  metricsProvenance?: string;
  degraded?: boolean;
}

export function fetchYouTubeVideo(urlOrId: string) {
  return attempt(() => api.get<VideoSnapshot>(`/api/v1/youtube/video?url=${encodeURIComponent(urlOrId)}`));
}

export interface ScriptWriteInput {
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

export function writeScriptWithProvider(input: ScriptWriteInput) {
  return attempt(() => api.post<{ texts: string[]; model: string }>("/api/v1/ai/script", input));
}

export interface PackagingContext {
  topic: string;
  audience: string;
  promise: string;
  takeaway: string;
  cta: string;
  title: string;
  script: string;
  chapters: string;
}

export function suggestTitlesWithProvider(context: PackagingContext) {
  return attempt(() =>
    api.post<{ titles: { text: string; category: string }[]; model: string }>("/api/v1/ai/package", { kind: "titles", context }),
  );
}

export function writeSeoWithProvider(context: PackagingContext) {
  return attempt(() =>
    api.post<{ description: string; tags: string[]; hashtags: string[]; model: string }>("/api/v1/ai/package", { kind: "seo", context }),
  );
}

export function rewriteSectionWithProvider(input: { heading: string; text: string; instruction: string; topic: string }) {
  return attempt(() => api.post<{ text: string; model: string }>("/api/v1/ai/rewrite", input));
}
