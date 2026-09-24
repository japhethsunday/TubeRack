import { titleKeywords } from "@/src/lib/growth/competitors";
import type { NicheVideoSample } from "@/src/lib/niche/score";

/** Trend radar math: velocity (views/hour since upload) and rising phrases. */

export interface TrendVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelSubs: number | null;
  thumbnail: string;
  publishedAt: string;
  views: number;
  viewsPerHour: number;
  isNew: boolean;
}

export interface TrendResult {
  ranAt: string;
  videos: TrendVideo[];
  phrases: { phrase: string; count: number }[];
  medianViewsPerHour: number;
}

export function velocity(views: number, publishedAt: string, now = Date.now()): number {
  const hours = Math.max(1, (now - new Date(publishedAt).getTime()) / 3_600_000);
  return Math.round(views / hours);
}

const STOP = new Set("the a an and or of to in on for with is are how why what i you my your this that it at from by be vs we do".split(" "));

function bigrams(titles: string[]): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const words = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
    const seen = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      if (STOP.has(words[i]) || STOP.has(words[i + 1])) continue;
      const p = `${words[i]} ${words[i + 1]}`;
      if (seen.has(p)) continue;
      seen.add(p);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([phrase, count]) => ({ phrase, count }));
}

export function trendResult(samples: NicheVideoSample[], previousIds: string[], now = Date.now()): TrendResult {
  const videos = samples
    .map((s) => ({
      videoId: s.videoId,
      title: s.title,
      channelTitle: s.channelTitle,
      channelSubs: s.channelSubs,
      thumbnail: s.thumbnail,
      publishedAt: s.publishedAt,
      views: s.views,
      viewsPerHour: velocity(s.views, s.publishedAt, now),
      isNew: !previousIds.includes(s.videoId),
    }))
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour);
  const titles = videos.map((v) => v.title);
  const phrases = [...bigrams(titles), ...titleKeywords(titles, 12).map((k) => ({ phrase: k.word, count: k.count }))]
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
    .filter((p, i, arr) => arr.findIndex((q) => q.phrase.includes(p.phrase) && q.count >= p.count) === i)
    .slice(0, 12);
  const sorted = videos.map((v) => v.viewsPerHour).sort((a, b) => a - b);
  return { ranAt: new Date(now).toISOString(), videos, phrases, medianViewsPerHour: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 };
}
