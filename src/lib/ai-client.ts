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
    if (error.code === "UNAUTHORIZED") return { ok: false, reason: "signed-out", message: "Sign in to generate and use YouTube data." };
    if (error.code === "BACKEND_UNAVAILABLE") return { ok: false, reason: "not-configured", message: error.message };
    if (error.code === "RATE_LIMITED") return { ok: false, reason: "rate-limited", message: error.message };
    if (error.code === "NETWORK_ERROR") return { ok: false, reason: "offline", message: error.message };
    return { ok: false, reason: "failed", message: error.message };
  }
  return { ok: false, reason: "failed", message: error instanceof Error ? error.message : "Request failed." };
}

/** Gemini overload (server already failed over across models). */
export function isBusyError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /very busy|high demand|overloaded|try again in a minute/i.test(msg);
}

/**
 * Overloads are usually over in seconds: wait and retry a couple of times
 * (8 s, then 20 s) before surfacing the error.
 */
export async function retryBusy<T>(call: () => Promise<T>, waits = [8000, 20000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await call();
    } catch (error) {
      if (i >= waits.length || !isBusyError(error)) throw error;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

export async function attempt<T>(call: () => Promise<T>): Promise<ProviderOutcome<T>> {
  try {
    return { ok: true, data: await retryBusy(call) };
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
    api.post<{ url: string; mimeType: string; model: string; durationSec?: number }>("/api/v1/ai/speech", { text, voice }),
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

export function transcribeWithProvider(file: string) {
  return attempt(() =>
    api.post<{ text: string; segments: { startSec: number; endSec: number; text: string }[]; model: string }>("/api/v1/ai/transcribe", { file }),
  );
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
  durationSec: number | null;
  definition: string;
  captions: boolean;
  licensedContent: boolean;
  madeForKids: boolean | null;
  embeddable: boolean;
  topics: string[];
  stats: { views?: number; likes?: number; comments?: number };
  channel: {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    customUrl: string;
    country: string;
    publishedAt: string;
    subscribers?: number;
    subscribersHidden: boolean;
    totalViews?: number;
    videoCount?: number;
  } | null;
  comments: { author: string; authorImage: string; text: string; likes: number; publishedAt: string; replies: number }[];
  commentsDisabled: boolean;
}

export function fetchYouTubeDetails(id: string) {
  return attempt(() => api.get<VideoDetails>(`/api/v1/youtube/details?id=${encodeURIComponent(id)}`));
}

export interface NicheResult {
  name: string;
  query: string;
  angle: string;
  audience: string;
  metrics: import("@/src/lib/niche/score").NicheMetrics;
  scores: import("@/src/lib/niche/score").NicheScores;
  topVideos: import("@/src/lib/niche/score").NicheVideoSample[];
}

export interface NicheScan {
  seed: string;
  days: number;
  model: string | null;
  niches: NicheResult[];
  failures: string[];
}

export function scanNiches(input: { seed: string; audience?: string; region?: string; count?: number; mode?: "expand" | "exact"; days?: number }) {
  return attempt(() => api.post<NicheScan>("/api/v1/niche/scan", input));
}

export function nicheReport(niche: NicheResult) {
  return attempt(() =>
    api.post<{ report: import("@/src/lib/niche/score").NicheReport; model: string }>("/api/v1/niche/report", {
      name: niche.name,
      query: niche.query,
      angle: niche.angle,
      metrics: niche.metrics,
      scores: niche.scores,
      topTitles: niche.topVideos.map((v) => v.title),
    }),
  );
}
