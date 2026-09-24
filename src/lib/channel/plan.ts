/** Channel strategy produced by the Channel Creator (validated shape). */

export interface ChannelInputs {
  niche: string;
  query: string;
  audience: string;
  region: string;
  contentType: "faceless" | "on-camera" | "mixed" | "animation" | "screen-recording";
  platform: "youtube" | "youtube-shorts" | "both";
  style: string;
  competitors: string[];
  brandName: string;
}

export interface ChannelPlan {
  names: { name: string; why: string }[];
  handles: { handle: string; available: boolean | null }[];
  positioning: string;
  tagline: string;
  about: string;
  brand: { voice: string; visualStyle: string; colors: string[]; typography: string; dos: string[]; donts: string[] };
  audience: { primary: string; painPoints: string[]; goals: string[]; watchContext: string };
  pillars: { name: string; purpose: string; share: number }[];
  categories: string[];
  formats: { name: string; length: string; cadence: string; why: string }[];
  ideas: { title: string; pillar: string; format: string; hook: string; angle: string }[];
  titlePatterns: string[];
  thumbnail: { style: string; rules: string[] };
  publishing: { cadence: string; days: string[]; time: string; first90Days: string[] };
  monetisation: { stage: string; actions: string[] }[];
  competitors: { name: string; strength: string; gap: string }[];
  seoKeywords: string[];
  channelKeywords: string[];
  launchChecklist: string[];
}

/** Evidence the plan is grounded in (all measured or user-supplied). */
export interface ChannelEvidence {
  market: {
    category: string;
    tier: number;
    medianViewsPerDay: number;
    sponsoredShare: number;
    affiliateShare: number;
    digitalShare: number;
    shortsViewsPerDay: number | null;
    longViewsPerDay: number | null;
    medianLongMinutes: number | null;
    topTitles: string[];
    scannedAt: string;
  } | null;
  competitors: { title: string; subscribers: number | null; videos: number | null; recentTitles: string[]; medianViews: number | null }[];
  notes: string[];
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, n: number, max = 200) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n).map(obj) : []);

/** Coerce a model response into a complete, bounded plan (handles checked separately). */
export function normalisePlan(raw: unknown): ChannelPlan {
  const r = obj(raw);
  const brand = obj(r.brand);
  const audience = obj(r.audience);
  const thumb = obj(r.thumbnail);
  const pub = obj(r.publishing);
  return {
    names: arr(r.names, 8).map((x) => ({ name: str(x.name, 60), why: str(x.why, 200) })).filter((x) => x.name),
    handles: strs(r.handles, 10, 30)
      .map((h) => h.replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, ""))
      .filter((h) => h.length >= 3)
      .map((handle) => ({ handle, available: null })),
    positioning: str(r.positioning, 600),
    tagline: str(r.tagline, 120),
    about: str(r.about, 1000),
    brand: {
      voice: str(brand.voice, 300),
      visualStyle: str(brand.visualStyle, 300),
      colors: strs(brand.colors, 5, 40),
      typography: str(brand.typography, 200),
      dos: strs(brand.dos, 6),
      donts: strs(brand.donts, 6),
    },
    audience: { primary: str(audience.primary, 400), painPoints: strs(audience.painPoints, 6), goals: strs(audience.goals, 6), watchContext: str(audience.watchContext, 300) },
    pillars: arr(r.pillars, 6).map((x) => ({ name: str(x.name, 60), purpose: str(x.purpose, 240), share: Math.max(0, Math.min(100, Math.round(Number(x.share) || 0))) })).filter((x) => x.name),
    categories: strs(r.categories, 8, 60),
    formats: arr(r.formats, 6).map((x) => ({ name: str(x.name, 60), length: str(x.length, 40), cadence: str(x.cadence, 60), why: str(x.why, 240) })).filter((x) => x.name),
    ideas: arr(r.ideas, 30).map((x) => ({ title: str(x.title, 100), pillar: str(x.pillar, 60), format: str(x.format, 60), hook: str(x.hook, 240), angle: str(x.angle, 240) })).filter((x) => x.title),
    titlePatterns: strs(r.titlePatterns, 12, 120),
    thumbnail: { style: str(thumb.style, 300), rules: strs(thumb.rules, 8) },
    publishing: { cadence: str(pub.cadence, 120), days: strs(pub.days, 7, 20), time: str(pub.time, 60), first90Days: strs(pub.first90Days, 8, 240) },
    monetisation: arr(r.monetisation, 5).map((x) => ({ stage: str(x.stage, 80), actions: strs(x.actions, 6, 240) })).filter((x) => x.stage),
    competitors: arr(r.competitors, 6).map((x) => ({ name: str(x.name, 80), strength: str(x.strength, 240), gap: str(x.gap, 240) })).filter((x) => x.name),
    seoKeywords: strs(r.seoKeywords, 25, 60),
    channelKeywords: strs(r.channelKeywords, 20, 40),
    launchChecklist: strs(r.launchChecklist, 15, 240),
  };
}

/** YouTube channel keywords field: space-separated, multi-word terms quoted, ≤ 500 chars. */
export function channelKeywordsField(keywords: string[]): string {
  let out = "";
  for (const k of keywords) {
    const clean = k.replace(/["<>]/g, "").trim();
    if (!clean) continue;
    const term = /\s/.test(clean) ? `"${clean}"` : clean;
    if ((out + " " + term).trim().length > 500) break;
    out = (out + " " + term).trim();
  }
  return out;
}
