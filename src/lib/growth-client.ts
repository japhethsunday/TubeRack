"use client";

import { api, ApiError } from "@/src/lib/api";
import { attempt } from "@/src/lib/ai-client";
import type { CalendarItem } from "@/src/lib/growth/calendar";
import type { TrendResult } from "@/src/lib/growth/trends";
import type { AbOutcome } from "@/src/lib/growth/abtest";

/** Browser calls for channel connect, competitors, trends, A/B tests, and the calendar. */

export interface Connection {
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  createdAt: string;
}

export interface ChannelAnalytics {
  channel: { id: string; title: string; thumbnail: string; subscribers: number | null; views: number | null; videos: number | null };
  range: { start: string; end: string; days: number };
  totals: Record<string, number>;
  daily: Record<string, string | number>[];
  topVideos: (Record<string, string | number> & { title: string; thumbnail: string })[];
  traffic: Record<string, string | number>[];
  impressions: { available: boolean; impressions?: number; ctr?: number };
}

export interface MyVideo {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  privacy: string;
  publishAt: string | null;
  views: number | null;
}

export const growth = {
  connection: () => attempt(() => api.get<{ configured: boolean; connection: Connection | null }>("/api/v1/youtube/connection")),
  disconnect: () => attempt(() => api.remove<{ disconnected: boolean }>("/api/v1/youtube/connection")),
  analytics: (days: number) => attempt(() => api.get<ChannelAnalytics>(`/api/v1/youtube/analytics?days=${days}`)),
  myVideos: () => attempt(() => api.get<MyVideo[]>("/api/v1/youtube/my-videos")),
  startUpload: (body: Record<string, unknown>) => attempt(() => api.post<{ uploadUrl: string }>("/api/v1/youtube/upload", body)),

  competitors: () => attempt(() => api.get<CompetitorRow[]>("/api/v1/competitors")),
  addCompetitor: (channel: string) => attempt(() => api.post<CompetitorRow>("/api/v1/competitors", { channel })),
  removeCompetitor: (id: string) => attempt(() => api.remove(`/api/v1/competitors?id=${encodeURIComponent(id)}`)),
  competitorReport: () => attempt(() => api.get<CompetitorReport[]>("/api/v1/competitors/report")),

  watches: () => attempt(() => api.get<TrendWatch[]>("/api/v1/trends")),
  addWatch: (query: string, region: string, emailDigest: boolean) => attempt(() => api.post<TrendWatch>("/api/v1/trends", { query, region, emailDigest })),
  toggleDigest: (id: string, emailDigest: boolean) => attempt(() => api.patch("/api/v1/trends", { id, emailDigest })),
  removeWatch: (id: string) => attempt(() => api.remove(`/api/v1/trends?id=${encodeURIComponent(id)}`)),
  scanWatch: (id: string) => attempt(() => api.post<TrendResult>("/api/v1/trends/scan", { id })),

  tests: () => attempt(() => api.get<AbTest[]>("/api/v1/abtests")),
  testAction: (id: string, action: string, variantId?: string) => attempt(() => api.post<AbTest>(`/api/v1/abtests/${id}`, { action, variantId })),
  deleteTest: (id: string) => attempt(() => api.remove(`/api/v1/abtests/${id}`)),
  createTest: (form: FormData) => attempt(() => postForm<AbTest>("/api/v1/abtests", form)),

  calendar: (from: string, to: string) => attempt(() => api.get<CalendarItem[]>(`/api/v1/calendar?from=${from}&to=${to}`)),
  addItem: (item: Partial<CalendarItem> & { projectId?: string | null }) => attempt(() => api.post<CalendarItem>("/api/v1/calendar", item)),
  updateItem: (id: string, patch: Partial<CalendarItem>) => attempt(() => api.patch<CalendarItem>(`/api/v1/calendar/${id}`, patch)),
  removeItem: (id: string) => attempt(() => api.remove(`/api/v1/calendar/${id}`)),
  planCalendar: (body: Record<string, unknown>) => attempt(() => api.post<{ created: number }>("/api/v1/calendar/plan", body)),
};

async function postForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", body: form });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection.", 0);
  }
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: string; message?: string };
  if (!response.ok) throw new ApiError((payload.error as never) ?? "INTERNAL_ERROR", payload.message ?? `Request failed (${response.status}).`, response.status);
  return payload.data as T;
}

export interface CompetitorRow {
  id: string;
  channel_id: string;
  title: string;
  thumbnail: string;
  subscribers: number | null;
  last_checked_at: string | null;
}

export interface CompetitorUpload {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  durationSec: number | null;
  multiple: number;
}

export interface CompetitorReport {
  competitor: CompetitorRow;
  stats: { medianViews: number; uploadsPerWeek: number; lastUploadDaysAgo: number | null; shortsShare: number; outliers: CompetitorUpload[] };
  uploads: CompetitorUpload[];
  keywords: { word: string; count: number }[];
  newOutliers: string[];
  error?: string;
}

export interface TrendWatch {
  id: string;
  query: string;
  region: string;
  email_digest: boolean;
  last_run_at: string | null;
  last_results: TrendResult | Record<string, never>;
}

export interface AbVariant {
  id: string;
  label: string;
}

export interface AbTest {
  id: string;
  video_id: string;
  video_title: string;
  status: "draft" | "running" | "completed" | "stopped";
  rotate_hours: number;
  cycles: number;
  variants: AbVariant[];
  windows: { variantId: string; start: string; end: string | null }[];
  current_index: number;
  next_rotate_at: string | null;
  results: AbOutcome | Record<string, never>;
  ai_scores: { scores?: { variantId?: string; score: number; strengths: string[]; weaknesses: string[] }[]; pickVariantId?: string | null; reasoning?: string };
  error: string | null;
  created_at: string;
}
