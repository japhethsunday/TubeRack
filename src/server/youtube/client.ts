import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import type {
  PlatformSnapshot,
  ResearchSource,
} from "@/src/lib/ai-gateway/intelligence";

/**
 * Server-only YouTube ingestion with a graceful fallback chain.
 *
 * Primary: YouTube Data API v3 (key-auth, ~1 unit per videos/channels call).
 * Fallbacks (no key, no quota):
 *   - oEmbed (official, keyless): video title + author. No metrics.
 *   - Invidious API (open source, AGPL): full snippet + statistics when
 *     YOUTUBE_FALLBACK_BASE points at an instance you trust (self-hosted
 *     recommended — public instances are rate-limited and unreliable).
 *
 * The key never leaves the server: import only from route handlers, server
 * components, workers, or tests. Every snapshot carries provenance plus a
 * `degraded` flag when a fallback served it; metrics are only present when
 * the source actually provides them — nothing is fabricated.
 * Quota note: `search.list` (100 units) is deliberately not wrapped — add a
 * metered route with credit checks before exposing search.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";
const OEMBED_BASE = "https://www.youtube.com/oembed";
const PROVENANCE_API = "youtube-data-api-v3";
const PROVENANCE_OEMBED = "youtube-oembed";
const PROVENANCE_INVIDIOUS = "invidious";

export function isYouTubeConfigured(env = getServerEnv()): boolean {
  return Boolean(env.YOUTUBE_API_KEY);
}

/** Optional Invidious-compatible base URL (https only, no trailing slash). */
export function fallbackBase(env = getServerEnv()): string | null {
  const raw = (env.YOUTUBE_FALLBACK_BASE ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!/^https:\/\/[^/]+$/.test(raw)) {
    throw new Error("YouTube fallback misconfigured: YOUTUBE_FALLBACK_BASE must be an https origin.");
  }
  return raw;
}

function requireKey(env = getServerEnv()): string {
  if (!env.YOUTUBE_API_KEY) {
    throw new ProviderNotConfiguredError("research", "Set YOUTUBE_API_KEY to enable YouTube ingestion.");
  }
  return env.YOUTUBE_API_KEY;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^[A-Za-z0-9_-]{24}$/;

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} failed: unexpected response (${response.status}).`);
  }
}

/** Referer for referrer-restricted keys (server requests send none by default). */
export function apiReferer(env = getServerEnv()): string {
  const raw = (env.YOUTUBE_API_REFERER || env.APP_URL || "").trim();
  try {
    return `${new URL(raw).origin}/`;
  } catch {
    return "";
  }
}

async function callApi(path: string, params: Record<string, string>, key: string): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ ...params, key });
  const referer = apiReferer();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}?${query.toString()}`, {
      headers: { Accept: "application/json", ...(referer ? { Referer: referer } : {}) },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    throw new Error("YouTube API request failed: network unreachable.");
  }
  const payload = await readJson(response, "YouTube API request");
  if (!response.ok) {
    const err = (payload.error ?? {}) as { message?: string; errors?: { reason?: string }[] };
    const reason = err.errors?.[0]?.reason;
    if (response.status === 403 && /referer|referrer/i.test(err.message ?? "")) {
      throw new Error(
        "YouTube rejected the API key: it is restricted to websites (HTTP referrers), which blocks server requests. " +
          "In Google Cloud → Credentials → this key, set Application restrictions to None (keep API restrictions = YouTube Data API v3), " +
          `or add ${referer || "your site URL"}* to its allowed referrers.`,
      );
    }
    // Never include the URL or key — status, reason, and Google's message only.
    throw new Error(
      `YouTube API request failed (${response.status}${reason ? `, ${reason}` : ""}): ${(err.message ?? `Request failed (${response.status}).`).slice(0, 200)}`,
    );
  }
  return payload;
}

/** Keyless oEmbed lookup: title + author for a video. No metrics exist here. */
async function fetchOembed(videoId: string): Promise<{ title: string; author: string }> {
  const url = `${OEMBED_BASE}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error("YouTube oEmbed request failed: network unreachable.");
  }
  if (!response.ok) throw new Error(`YouTube oEmbed request failed (${response.status}).`);
  const payload = await readJson(response, "YouTube oEmbed request");
  if (typeof payload.title !== "string" || !payload.title) throw new Error("YouTube oEmbed request failed: video not found.");
  return { title: payload.title, author: typeof payload.author_name === "string" ? payload.author_name : "" };
}

/** Invidious-compatible video fetch (statistics included when served). */
async function fetchInvidiousVideo(
  base: string,
  videoId: string,
): Promise<{ title: string; description: string; author: string; published: string | null; views: number | null; likes: number | null }> {
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/videos/${videoId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("YouTube fallback request failed: network unreachable.");
  }
  if (!response.ok) throw new Error(`YouTube fallback request failed (${response.status}).`);
  const payload = await readJson(response, "YouTube fallback request");
  if (typeof payload.title !== "string" || !payload.title) throw new Error("YouTube fallback request failed: video not found.");
  return {
    title: payload.title,
    description: typeof payload.description === "string" ? payload.description : "",
    author: typeof payload.author === "string" ? payload.author : "",
    published: typeof payload.published === "number" ? new Date(payload.published * 1000).toISOString() : null,
    views: toNumber(payload.viewCount) ?? null,
    likes: toNumber(payload.likeCount) ?? null,
  };
}

/** Invidious-compatible channel fetch. */
async function fetchInvidiousChannel(
  base: string,
  channelId: string,
): Promise<{ title: string; subscribers: number | null; views: number | null; videos: number | null }> {
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/channels/${channelId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("YouTube fallback request failed: network unreachable.");
  }
  if (!response.ok) throw new Error(`YouTube fallback request failed (${response.status}).`);
  const payload = await readJson(response, "YouTube fallback request");
  if (typeof payload.author !== "string" || !payload.author) throw new Error("YouTube fallback request failed: channel not found.");
  return {
    title: payload.author,
    subscribers: toNumber(payload.subCount) ?? null,
    views: toNumber(payload.totalViews) ?? null,
    videos: Array.isArray(payload.latestVideos) ? null : toNumber(payload.videoCount) ?? null,
  };
}

/** Video snapshot: Data API → oEmbed → Invidious (first success wins). */
export async function fetchVideoSnapshot(videoId: string): Promise<PlatformSnapshot> {
  if (!VIDEO_ID.test(videoId)) throw new Error("YouTube request failed: invalid video id.");
  const env = getServerEnv();
  if (env.YOUTUBE_API_KEY) {
    try {
      const payload = await callApi("/videos", { part: "snippet,statistics", id: videoId }, env.YOUTUBE_API_KEY);
      const item = (payload.items as Record<string, unknown>[] | undefined)?.[0];
      if (!item) throw new Error("not found");
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const stats = (item.statistics ?? {}) as Record<string, unknown>;
      const metrics: Record<string, number> = {};
      for (const [from, to] of [["viewCount", "views"], ["likeCount", "likes"], ["commentCount", "comments"]] as const) {
        const n = toNumber(stats[from]);
        if (n !== undefined) metrics[to] = n;
      }
      return {
        kind: "video",
        externalId: videoId,
        title: typeof snippet.title === "string" ? snippet.title : videoId,
        fetchedAt: new Date().toISOString(),
        metrics,
        metricsProvenance: PROVENANCE_API,
      };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      // Fall through to keyless sources; provenance records the switch.
    }
  }
  try {
    const oembed = await fetchOembed(videoId);
    return {
      kind: "video",
      externalId: videoId,
      title: oembed.title,
      fetchedAt: new Date().toISOString(),
      metrics: {},
      metricsProvenance: PROVENANCE_OEMBED,
      degraded: true,
    };
  } catch {
    // Last resort: configured Invidious instance.
  }
  const base = fallbackBase(env);
  if (base) {
    const inv = await fetchInvidiousVideo(base, videoId);
    const metrics: Record<string, number> = {};
    if (inv.views !== null) metrics.views = inv.views;
    if (inv.likes !== null) metrics.likes = inv.likes;
    return {
      kind: "video",
      externalId: videoId,
      title: inv.title,
      fetchedAt: new Date().toISOString(),
      metrics,
      metricsProvenance: PROVENANCE_INVIDIOUS,
      degraded: true,
    };
  }
  throw new Error("YouTube request failed: video unavailable from all configured sources.");
}

/** Channel snapshot: Data API → Invidious (oEmbed has no channel endpoint). */
export async function fetchChannelSnapshot(channelId: string): Promise<PlatformSnapshot> {
  if (!CHANNEL_ID.test(channelId)) throw new Error("YouTube request failed: invalid channel id.");
  const env = getServerEnv();
  if (env.YOUTUBE_API_KEY) {
    try {
      const payload = await callApi("/channels", { part: "snippet,statistics", id: channelId }, env.YOUTUBE_API_KEY);
      const item = (payload.items as Record<string, unknown>[] | undefined)?.[0];
      if (!item) throw new Error("not found");
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const stats = (item.statistics ?? {}) as Record<string, unknown>;
      const metrics: Record<string, number> = {};
      for (const [from, to] of [["subscriberCount", "subscribers"], ["viewCount", "views"], ["videoCount", "videos"]] as const) {
        const n = toNumber(stats[from]);
        if (n !== undefined) metrics[to] = n;
      }
      return {
        kind: "channel",
        externalId: channelId,
        title: typeof snippet.title === "string" ? snippet.title : channelId,
        fetchedAt: new Date().toISOString(),
        metrics,
        metricsProvenance: PROVENANCE_API,
      };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
    }
  }
  const base = fallbackBase(env);
  if (base) {
    const inv = await fetchInvidiousChannel(base, channelId);
    const metrics: Record<string, number> = {};
    if (inv.subscribers !== null) metrics.subscribers = inv.subscribers;
    if (inv.views !== null) metrics.views = inv.views;
    return {
      kind: "channel",
      externalId: channelId,
      title: inv.title,
      fetchedAt: new Date().toISOString(),
      metrics,
      metricsProvenance: PROVENANCE_INVIDIOUS,
      degraded: true,
    };
  }
  throw new Error("YouTube request failed: channel unavailable (Data API blocked, no fallback instance configured).");
}

/** Video as a research source: Data API → oEmbed → Invidious. */
export async function fetchVideoResearch(videoId: string): Promise<ResearchSource> {
  if (!VIDEO_ID.test(videoId)) throw new Error("YouTube request failed: invalid video id.");
  const env = getServerEnv();
  if (env.YOUTUBE_API_KEY) {
    try {
      const payload = await callApi("/videos", { part: "snippet,statistics", id: videoId }, env.YOUTUBE_API_KEY);
      const item = (payload.items as Record<string, unknown>[] | undefined)?.[0];
      if (!item) throw new Error("not found");
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const stats = (item.statistics ?? {}) as Record<string, unknown>;
      const title = typeof snippet.title === "string" ? snippet.title : videoId;
      const facts: string[] = [];
      if (typeof snippet.publishedAt === "string") facts.push(`Published ${snippet.publishedAt.slice(0, 10)}.`);
      const views = toNumber(stats.viewCount);
      if (views !== undefined) facts.push(`${views.toLocaleString("en-US")} views.`);
      const tags = Array.isArray(snippet.tags) ? snippet.tags.filter((t): t is string => typeof t === "string") : [];
      if (tags.length > 0) facts.push(`Tagged: ${tags.slice(0, 8).join(", ")}.`);
      return {
        id: `yt-${videoId}`,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        summary: typeof snippet.description === "string" ? snippet.description.slice(0, 1000) : "",
        facts,
        publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : undefined,
        credibility: "high",
        notes: "YouTube Data API v3 snippet + statistics.",
      };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
    }
  }
  try {
    const oembed = await fetchOembed(videoId);
    return {
      id: `yt-${videoId}`,
      title: oembed.title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      summary: "",
      facts: oembed.author ? [`By ${oembed.author}.`] : [],
      credibility: "medium",
      notes: "YouTube oEmbed (title only — Data API unavailable, no view metrics).",
    };
  } catch {
    // Last resort below.
  }
  const base = fallbackBase(env);
  if (base) {
    const inv = await fetchInvidiousVideo(base, videoId);
    const facts: string[] = [];
    if (inv.published) facts.push(`Published ${inv.published.slice(0, 10)}.`);
    if (inv.views !== null) facts.push(`${inv.views.toLocaleString("en-US")} views.`);
    if (inv.author) facts.push(`By ${inv.author}.`);
    return {
      id: `yt-${videoId}`,
      title: inv.title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      summary: inv.description.slice(0, 1000),
      facts,
      publishedAt: inv.published ?? undefined,
      credibility: "medium",
      notes: `Invidious fallback (${base}) — Data API unavailable.`,
    };
  }
  throw new Error("YouTube request failed: video unavailable from all configured sources.");
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

/**
 * Keyword search (Data API only): search.list (100 units) + one videos.list
 * (1 unit) for statistics. Callers must meter it (expensive rate class).
 */
export async function searchVideos(query: string, maxResults = 10): Promise<YouTubeSearchResult[]> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new Error("YouTube search failed: query cannot be empty.");
  const key = requireKey();
  const limit = String(Math.min(25, Math.max(1, Math.floor(maxResults))));
  const search = await callApi("/search", { part: "snippet", type: "video", q, maxResults: limit, safeSearch: "moderate" }, key);
  const items = Array.isArray(search.items) ? (search.items as Record<string, unknown>[]) : [];
  const results: YouTubeSearchResult[] = [];
  for (const item of items) {
    const id = (item.id ?? {}) as { videoId?: string };
    const sn = (item.snippet ?? {}) as Record<string, unknown>;
    if (!id.videoId || !VIDEO_ID.test(id.videoId)) continue;
    const thumbs = (sn.thumbnails ?? {}) as Record<string, { url?: string }>;
    results.push({
      videoId: id.videoId,
      title: String(sn.title ?? ""),
      channelTitle: String(sn.channelTitle ?? ""),
      channelId: String(sn.channelId ?? ""),
      publishedAt: String(sn.publishedAt ?? ""),
      description: String(sn.description ?? ""),
      thumbnail: thumbs.medium?.url ?? thumbs.default?.url ?? "",
    });
  }
  if (results.length === 0) return results;
  const stats = await callApi("/videos", { part: "statistics", id: results.map((r) => r.videoId).join(",") }, key);
  const byId = new Map<string, Record<string, unknown>>();
  for (const v of (Array.isArray(stats.items) ? stats.items : []) as Record<string, unknown>[]) {
    byId.set(String(v.id), (v.statistics ?? {}) as Record<string, unknown>);
  }
  for (const r of results) {
    const s = byId.get(r.videoId);
    if (!s) continue;
    r.views = toNumber(s.viewCount);
    r.likes = toNumber(s.likeCount);
    r.comments = toNumber(s.commentCount);
  }
  return results;
}

/** Accepts a raw id or any common YouTube URL form; returns the 11-char id or null. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    let candidate: string | null = null;
    if (host === "youtu.be") candidate = url.pathname.slice(1).split("/")[0];
    else if (host.endsWith("youtube.com")) {
      candidate = url.searchParams.get("v");
      if (!candidate) {
        const m = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname);
        candidate = m?.[1] ?? null;
      }
    }
    return candidate && VIDEO_ID.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
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

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(value: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value ?? "");
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Everything the Data API exposes about one video, its channel, and top
 * comments (~3 quota units). Nothing is estimated; missing fields stay empty.
 */
export async function fetchVideoDetails(videoId: string): Promise<VideoDetails> {
  if (!VIDEO_ID.test(videoId)) throw new Error("YouTube request failed: invalid video id.");
  const key = requireKey();
  const payload = await callApi("/videos", { part: "snippet,statistics,contentDetails,status,topicDetails", id: videoId }, key);
  const item = (Array.isArray(payload.items) ? payload.items[0] : undefined) as Record<string, unknown> | undefined;
  if (!item) throw new Error("YouTube request failed: video not found or private.");
  const sn = (item.snippet ?? {}) as Record<string, unknown>;
  const st = (item.statistics ?? {}) as Record<string, unknown>;
  const cd = (item.contentDetails ?? {}) as Record<string, unknown>;
  const status = (item.status ?? {}) as Record<string, unknown>;
  const topics = ((item.topicDetails ?? {}) as { topicCategories?: string[] }).topicCategories ?? [];
  const thumbs = (sn.thumbnails ?? {}) as Record<string, { url?: string }>;
  const channelId = str(sn.channelId);

  const [channelRes, commentsRes] = await Promise.allSettled([
    channelId ? callApi("/channels", { part: "snippet,statistics", id: channelId }, key) : Promise.resolve({} as Record<string, unknown>),
    callApi("/commentThreads", { part: "snippet", videoId, maxResults: "12", order: "relevance", textFormat: "plainText" }, key),
  ]);

  let channel: VideoDetails["channel"] = null;
  if (channelRes.status === "fulfilled") {
    const ch = (Array.isArray(channelRes.value.items) ? channelRes.value.items[0] : undefined) as Record<string, unknown> | undefined;
    if (ch) {
      const cs = (ch.snippet ?? {}) as Record<string, unknown>;
      const cstat = (ch.statistics ?? {}) as Record<string, unknown>;
      const cthumb = (cs.thumbnails ?? {}) as Record<string, { url?: string }>;
      channel = {
        id: channelId,
        title: str(cs.title),
        description: str(cs.description),
        thumbnail: cthumb.medium?.url ?? cthumb.default?.url ?? "",
        customUrl: str(cs.customUrl),
        country: str(cs.country),
        publishedAt: str(cs.publishedAt),
        subscribers: cstat.hiddenSubscriberCount ? undefined : toNumber(cstat.subscriberCount),
        subscribersHidden: Boolean(cstat.hiddenSubscriberCount),
        totalViews: toNumber(cstat.viewCount),
        videoCount: toNumber(cstat.videoCount),
      };
    }
  }

  let comments: VideoDetails["comments"] = [];
  let commentsDisabled = false;
  if (commentsRes.status === "fulfilled") {
    comments = ((Array.isArray(commentsRes.value.items) ? commentsRes.value.items : []) as Record<string, unknown>[]).map((t) => {
      const ts = (t.snippet ?? {}) as Record<string, unknown>;
      const top = ((ts.topLevelComment ?? {}) as { snippet?: Record<string, unknown> }).snippet ?? {};
      return {
        author: str(top.authorDisplayName),
        authorImage: str(top.authorProfileImageUrl),
        text: str(top.textDisplay).slice(0, 2000),
        likes: toNumber(top.likeCount) ?? 0,
        publishedAt: str(top.publishedAt),
        replies: toNumber(ts.totalReplyCount) ?? 0,
      };
    });
  } else {
    commentsDisabled = /commentsDisabled|disabled comments/i.test(String(commentsRes.reason));
  }

  return {
    id: videoId,
    title: str(sn.title),
    description: str(sn.description),
    publishedAt: str(sn.publishedAt),
    thumbnail: thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? "",
    tags: Array.isArray(sn.tags) ? (sn.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 60) : [],
    categoryId: str(sn.categoryId),
    defaultLanguage: str(sn.defaultLanguage) || str(sn.defaultAudioLanguage),
    durationSec: parseIsoDuration(str(cd.duration)),
    definition: str(cd.definition),
    captions: str(cd.caption) === "true",
    licensedContent: Boolean(cd.licensedContent),
    madeForKids: typeof status.madeForKids === "boolean" ? status.madeForKids : null,
    embeddable: status.embeddable !== false,
    topics: topics.map((t) => decodeURIComponent(t.split("/").pop() ?? "").replace(/_/g, " ")).filter(Boolean),
    stats: { views: toNumber(st.viewCount), likes: toNumber(st.likeCount), comments: toNumber(st.commentCount) },
    channel,
    comments,
    commentsDisabled,
  };
}
