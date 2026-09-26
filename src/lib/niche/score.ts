/**
 * Niche scoring from real YouTube samples. Every input is a number the
 * Data API returned; scores are transparent formulas, not guesses.
 */

export interface NicheVideoSample {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  views: number;
  durationSec: number | null;
  channelSubs: number | null;
  /** The video's own tags (when the uploader set any). */
  tags?: string[];
}

export interface NicheMetrics {
  sampleSize: number;
  medianViews: number;
  medianViewsPerDay: number;
  medianChannelSubs: number | null;
  bigChannelShare: number; // share of sample from channels ≥ 1M subs
  smallChannelWinners: number; // videos from < 100k-sub channels that out-viewed their sub count
  smallChannelShare: number; // share of sample from < 100k-sub channels
  shortsShare: number;
  uniqueChannels: number;
  totalResults: number | null;
}

export interface NicheScores {
  demand: number;
  competition: number;
  opportunity: number;
  overall: number;
  verdict: "Strong opportunity" | "Promising" | "Crowded" | "Low demand";
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function daysSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(1, (now - t) / 86_400_000) : 1;
}

export function nicheMetrics(samples: NicheVideoSample[], totalResults: number | null = null, now = Date.now()): NicheMetrics {
  const n = samples.length;
  const subs = samples.map((s) => s.channelSubs).filter((v): v is number => typeof v === "number");
  const small = samples.filter((s) => s.channelSubs !== null && s.channelSubs < 100_000);
  return {
    sampleSize: n,
    medianViews: Math.round(median(samples.map((s) => s.views))),
    medianViewsPerDay: Math.round(median(samples.map((s) => s.views / daysSince(s.publishedAt, now)))),
    medianChannelSubs: subs.length ? Math.round(median(subs)) : null,
    bigChannelShare: n ? samples.filter((s) => (s.channelSubs ?? 0) >= 1_000_000).length / n : 0,
    smallChannelWinners: small.filter((s) => s.views >= Math.max(1_000, s.channelSubs ?? 0)).length,
    smallChannelShare: n ? small.length / n : 0,
    shortsShare: n ? samples.filter((s) => s.durationSec !== null && s.durationSec <= 60).length / n : 0,
    uniqueChannels: new Set(samples.map((s) => s.channelId)).size,
    totalResults,
  };
}

export function nicheScores(m: NicheMetrics): NicheScores {
  if (m.sampleSize === 0) return { demand: 0, competition: 0, opportunity: 0, overall: 0, verdict: "Low demand" };
  // 10 views/day → 0, 100k views/day → 100 (log scale).
  const demand = clamp(((Math.log10(m.medianViewsPerDay + 1) - 1) / 4) * 100);
  // Median channel size (1k → 0, 10M → 100) blended with big-channel dominance.
  const subsPart = m.medianChannelSubs === null ? 50 : clamp(((Math.log10(m.medianChannelSubs + 1) - 3) / 4) * 100);
  const competition = clamp(subsPart * 0.6 + m.bigChannelShare * 100 * 0.4);
  // Small channels breaking through is the clearest opportunity signal.
  const winnersShare = m.smallChannelWinners / m.sampleSize;
  const opportunity = clamp(winnersShare * 100 * 0.6 + m.smallChannelShare * 100 * 0.25 + (100 - competition) * 0.15);
  const overall = Math.round(demand * 0.4 + opportunity * 0.35 + (100 - competition) * 0.25);
  const verdict: NicheScores["verdict"] =
    demand < 25 ? "Low demand" : overall >= 60 ? "Strong opportunity" : competition >= 70 && opportunity < 35 ? "Crowded" : "Promising";
  return { demand: Math.round(demand), competition: Math.round(competition), opportunity: Math.round(opportunity), overall, verdict };
}

export interface NicheReport {
  summary: string;
  audience: string;
  pillars: string[];
  videoIdeas: { title: string; hook: string; format: string }[];
  monetization: string[];
  risks: string[];
  firstWeekPlan: string[];
}
