import { median } from "@/src/lib/niche/score";

/** Competitor analytics from real uploads: outliers, cadence, and title patterns. */

export interface UploadLike {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  durationSec: number | null;
}

/** Views relative to the channel's own median; ≥ 3× is an outlier. */
export const OUTLIER_MULTIPLE = 3;

export function competitorStats<T extends UploadLike>(uploads: T[], now = Date.now()) {
  // Very fresh uploads haven't had time to accumulate views; exclude < 2 days old from the baseline.
  const settled = uploads.filter((u) => now - new Date(u.publishedAt).getTime() > 2 * 86_400_000);
  const base = median((settled.length ? settled : uploads).map((u) => u.views));
  const scored = uploads.map((u) => ({ ...u, multiple: base > 0 ? u.views / base : 0 }));
  const outliers = scored.filter((u) => u.multiple >= OUTLIER_MULTIPLE).sort((a, b) => b.multiple - a.multiple);
  const dates = uploads.map((u) => new Date(u.publishedAt).getTime()).filter(Number.isFinite).sort((a, b) => b - a);
  const gaps = dates.slice(1).map((d, i) => (dates[i] - d) / 86_400_000);
  const perWeek = gaps.length ? 7 / Math.max(0.5, median(gaps)) : 0;
  const shorts = uploads.filter((u) => u.durationSec !== null && u.durationSec <= 60).length;
  return {
    medianViews: Math.round(base),
    uploadsPerWeek: Math.round(perWeek * 10) / 10,
    lastUploadDaysAgo: dates.length ? Math.floor((now - dates[0]) / 86_400_000) : null,
    shortsShare: uploads.length ? shorts / uploads.length : 0,
    scored,
    outliers,
  };
}

const STOP = new Set("the a an and or of to in on for with is are how why what i you my your this that it at from by be vs your our we can will do not".split(" "));

/** Most frequent meaningful words across titles (for "what's working" patterns). */
export function titleKeywords(titles: string[], top = 10): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const seen = new Set<string>();
    for (const w of t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, top).map(([word, count]) => ({ word, count }));
}
