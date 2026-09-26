import { scanNiche } from "@/src/server/youtube/client";
import type { NicheVideoSample } from "@/src/lib/niche/score";

export interface MarketReference {
  videoId: string;
  title: string;
  channel: string;
  views: number;
  viewsPerDay: number;
  /** Views ÷ channel subscribers: above 1 means the video beat its channel's usual reach. */
  outlier: number | null;
}

export interface MarketBrief {
  /** Plain-text evidence for the writer: what is getting views in this niche right now. */
  summary: string;
  references: MarketReference[];
}

const cache = new Map<string, { at: number; brief: Promise<MarketBrief | null> }>();
const TTL = 6 * 3600_000;

function ageDays(iso: string): number {
  return Math.max(1, (Date.now() - Date.parse(iso)) / 86_400_000);
}

/**
 * The most-viewed recent YouTube videos for a topic (~100 quota units, cached
 * 6 h): titles, reach, breakout ratio and the tags they use, so titles and
 * descriptions follow what this audience actually clicks on.
 */
export async function marketBrief(topic: string): Promise<MarketBrief | null> {
  const q = topic.trim().replace(/\s+/g, " ").slice(0, 120);
  if (q.length < 3) return null;
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.brief;
  // Titles and SEO are written together: share one lookup (one quota charge).
  const brief = build(q);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), brief });
  brief.catch(() => cache.delete(key));
  return brief;
}

async function build(q: string): Promise<MarketBrief | null> {
  const { samples } = await scanNiche(q, { days: 120, maxResults: 20 });
  if (!samples.length) return null;
  const refs = samples
    .map((v: NicheVideoSample) => ({
      v,
      viewsPerDay: Math.round(v.views / ageDays(v.publishedAt)),
      outlier: v.channelSubs && v.channelSubs > 0 ? Math.round((v.views / v.channelSubs) * 10) / 10 : null,
    }))
    .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
    .slice(0, 12);
  const tagCount = new Map<string, number>();
  for (const { v } of refs) for (const t of v.tags ?? []) tagCount.set(t.toLowerCase(), (tagCount.get(t.toLowerCase()) ?? 0) + 1);
  const commonTags = [...tagCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  const lines = refs.map(
    ({ v, viewsPerDay, outlier }, i) =>
      `${i + 1}. "${v.title}" — ${v.views.toLocaleString("en-US")} views (${viewsPerDay.toLocaleString("en-US")}/day)${outlier !== null ? `, ${outlier}× the channel's subscribers` : ""}${v.durationSec ? `, ${Math.round(v.durationSec / 60)} min` : ""}`,
  );
  const summary = [
    `Top-performing YouTube videos about "${q}" from the last 4 months (sorted by views per day):`,
    ...lines,
    commonTags.length ? `Tags these videos share: ${commonTags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const brief: MarketBrief = {
    summary,
    references: refs.map(({ v, viewsPerDay, outlier }) => ({ videoId: v.videoId, title: v.title, channel: v.channelTitle, views: v.views, viewsPerDay, outlier })),
  };
  return brief;
}
