import { fetchVideoDetails, parseVideoId, scanMarket } from "@/src/server/youtube/client";
import { GeminiTextProvider } from "@/src/server/ai/gemini";
import { extractJsonObject } from "@/src/lib/ai-gateway/json";
import { SHORT_MAX_SEC } from "@/src/lib/market/signals";

/**
 * Video Recreator: finds the videos over-performing in a niche (views far
 * above what their channel's size predicts), breaks one down (packaging,
 * hook, structure, what viewers loved and what they asked for), and writes an
 * original blueprint that borrows the proven demand, not the content.
 */

export interface Outlier {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
  durationSec: number | null;
  subscribers: number | null;
  viewsPerDay: number;
  /** Views ÷ channel subscribers (null when subscribers are hidden). */
  multiplier: number | null;
  /** Views per day ÷ the scan's median views per day. */
  lift: number;
  short: boolean;
}

export interface OutlierScan {
  query: string;
  days: number;
  format: "any" | "long" | "short";
  scannedAt: string;
  medianViewsPerDay: number;
  videos: Outlier[];
}

export interface Breakdown {
  summary: string;
  packaging: { title: string; thumbnail: string };
  hook: string;
  promise: string;
  structure: { beat: string; purpose: string }[];
  emotions: string[];
  audienceLoved: string[];
  audienceWants: string[];
  weaknesses: string[];
}

export interface Blueprint {
  titles: string[];
  thumbnail: string;
  thumbnailText: string;
  hook: string;
  angle: string;
  outline: { beat: string; say: string; show: string; seconds: number }[];
  retention: string[];
  cta: string;
  lengthSec: number;
  format: "Long-form" | "Short";
  keywords: string[];
  originality: string[];
}

export interface Recreation {
  createdAt: string;
  niche: string;
  audience: string;
  source: {
    id: string;
    title: string;
    channel: string;
    thumbnail: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    subscribers: number | null;
    durationSec: number | null;
    publishedAt: string;
    multiplier: number | null;
    tags: string[];
  };
  breakdown: Breakdown;
  blueprint: Blueprint;
  model: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const daysSince = (iso: string) => Math.max(1, (Date.now() - new Date(iso).getTime()) / 86_400_000);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

/** The niche's over-performers: ranked by how far views beat channel size, then by views/day. */
export async function findOutliers(input: { query: string; days: number; format: "any" | "long" | "short" }): Promise<OutlierScan> {
  const { samples } = await scanMarket(input.query, { days: input.days });
  const all = samples
    .filter((s) => s.views > 0 && s.publishedAt)
    .map((s) => {
      const viewsPerDay = s.views / daysSince(s.publishedAt);
      return {
        id: s.videoId,
        title: s.title,
        channel: s.channelTitle,
        channelId: s.channelId,
        thumbnail: s.thumbnail,
        views: s.views,
        publishedAt: s.publishedAt,
        durationSec: s.durationSec,
        subscribers: s.channelSubs,
        viewsPerDay: Math.round(viewsPerDay),
        multiplier: s.channelSubs && s.channelSubs > 0 ? Math.round((s.views / s.channelSubs) * 10) / 10 : null,
        lift: 0,
        short: s.durationSec !== null && s.durationSec <= SHORT_MAX_SEC,
      };
    });
  const med = median(all.map((v) => v.viewsPerDay));
  for (const v of all) v.lift = med > 0 ? Math.round((v.viewsPerDay / med) * 10) / 10 : 0;
  const videos = all
    .filter((v) => (input.format === "short" ? v.short : input.format === "long" ? !v.short : true))
    // Small channels beating their size are the most repeatable wins.
    .sort((a, b) => score(b) - score(a))
    .slice(0, 20);
  return { query: input.query, days: input.days, format: input.format, scannedAt: new Date().toISOString(), medianViewsPerDay: Math.round(med), videos };
}

function score(v: Outlier): number {
  const m = v.multiplier ?? 1;
  return Math.log10(1 + Math.min(m, 200)) * 2 + Math.log10(1 + v.lift);
}

/** Chapter lines ("0:00 Intro") from a description: the creator's own structure. */
export function chaptersFrom(description: string): string[] {
  return description
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*[-–—:]?\s*\S/.test(l))
    .slice(0, 30);
}

export async function recreateVideo(input: { video: string; niche: string; audience: string; channelName: string; format: "auto" | "long" | "short" }): Promise<Recreation> {
  const id = parseVideoId(input.video);
  if (!id) throw new Error("That isn't a YouTube video link.");
  const v = await fetchVideoDetails(id);
  const subs = v.channel?.subscribers ?? null;
  const views = v.stats.views ?? null;
  const multiplier = views !== null && subs ? Math.round((views / subs) * 10) / 10 : null;
  const chapters = chaptersFrom(v.description);
  const sourceShort = v.durationSec !== null && v.durationSec <= SHORT_MAX_SEC;
  const short = input.format === "short" || (input.format === "auto" && sourceShort);
  const niche = input.niche.trim() || v.topics[0] || v.tags[0] || "";

  const comments = v.comments
    .slice(0, 12)
    .map((c, i) => `[V${i + 1}] (${c.likes} likes) ${c.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  const facts = [
    `Title: "${v.title}"`,
    `Channel: ${v.channel?.title ?? "unknown"} (${subs !== null ? `${subs.toLocaleString("en")} subscribers` : "subscribers hidden"})`,
    `Views: ${views?.toLocaleString("en") ?? "hidden"} · Likes: ${v.stats.likes?.toLocaleString("en") ?? "hidden"} · Comments: ${v.stats.comments?.toLocaleString("en") ?? "hidden"}`,
    multiplier !== null ? `Views are ${multiplier}× the channel's subscriber count.` : "",
    `Published: ${v.publishedAt.slice(0, 10)} · Length: ${v.durationSec !== null ? `${Math.floor(v.durationSec / 60)}m ${v.durationSec % 60}s` : "unknown"}`,
    v.tags.length ? `Tags: ${v.tags.slice(0, 20).join(", ")}` : "",
    `Description (start): ${v.description.slice(0, 1500)}`,
    chapters.length ? `Creator's chapters:\n${chapters.join("\n")}` : "No chapters in the description: infer the structure from the title, description and comments, and say it is inferred.",
    comments ? `Top viewer comments:\n${comments}` : "No comments available.",
  ]
    .filter(Boolean)
    .join("\n");

  const target = short ? "a YouTube Short (30-60 seconds)" : `a long-form video (about ${Math.max(6, Math.min(20, Math.round((v.durationSec ?? 600) / 60)))} minutes)`;
  const prompt = `You are a senior YouTube strategist. A creator${input.channelName ? ` running "${input.channelName}"` : ""} in the "${niche}" niche${input.audience ? ` for ${input.audience}` : ""} wants to recreate the success of this over-performing video.

SOURCE VIDEO (real data from YouTube):
${facts}

Task 1 — BREAKDOWN: explain precisely why this video over-performed: packaging (title + thumbnail working together), the hook, the core promise, its structure beat by beat, the emotions it triggers, what viewers loved (cite comments as [V1]...), what viewers still want or asked for, and its weaknesses (where a better video could win).

Task 2 — BLUEPRINT: design ${target} that captures the same proven demand but is clearly ORIGINAL and BETTER: a new angle, the creator's own examples and voice, fixes the weaknesses, answers what viewers asked for. Never copy the title, script, thumbnail or footage; never impersonate the source creator. The outline must be a complete, producible plan: each beat has what to say (1-3 spoken sentences) and what to show; beat seconds must add up to lengthSec.

Rules: never invent numbers; use only the data above. Plain, specific language.

Respond ONLY with JSON:
{"breakdown":{"summary":"2-3 sentences","packaging":{"title":"why the title works","thumbnail":"what the thumbnail likely shows and why it works with the title"},"hook":"how the first seconds grab","promise":"the core promise","structure":[{"beat":"name","purpose":"what it does for retention"}],"emotions":["curiosity"],"audienceLoved":["[V2] ..."],"audienceWants":["..."],"weaknesses":["..."]},
"blueprint":{"titles":["3 options, under 70 chars, keyword near the front"],"thumbnail":"visual concept","thumbnailText":"max 4 words","hook":"the first 5-10 seconds, spoken word for word","angle":"what makes this version different and better","outline":[{"beat":"name","say":"spoken lines","show":"visuals","seconds":30}],"retention":["re-hook moments and pattern interrupts"],"cta":"single end call to action","lengthSec":600,"keywords":["search phrases"],"originality":["how this stays original, not a copy"]}}`;

  const { text, model } = await new GeminiTextProvider().generateText({ prompt, maxTokens: 8192, json: true, skills: ["youtube", "content", "copy", "marketing"] });
  const obj = (extractJsonObject(text) ?? {}) as { breakdown?: Record<string, unknown>; blueprint?: Record<string, unknown> };
  const b = obj.breakdown ?? {};
  const p = obj.blueprint ?? {};
  const pk = (b.packaging ?? {}) as Record<string, unknown>;
  const outline = (Array.isArray(p.outline) ? p.outline : [])
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return { beat: str(r.beat, 80), say: str(r.say, 900), show: str(r.show, 400), seconds: Math.max(3, Math.min(900, Math.round(Number(r.seconds) || 0))) };
    })
    .filter((o) => o.beat && o.say)
    .slice(0, 24);
  const blueprint: Blueprint = {
    titles: strs(p.titles, 100, 3),
    thumbnail: str(p.thumbnail, 300),
    thumbnailText: str(p.thumbnailText, 40),
    hook: str(p.hook, 600),
    angle: str(p.angle, 500),
    outline,
    retention: strs(p.retention, 240, 8),
    cta: str(p.cta, 240),
    lengthSec: outline.reduce((s, o) => s + o.seconds, 0) || Math.round(Number(p.lengthSec) || 0),
    format: short ? "Short" : "Long-form",
    keywords: strs(p.keywords, 80, 10),
    originality: strs(p.originality, 240, 6),
  };
  if (!blueprint.titles.length || !blueprint.hook || outline.length < 2) throw new Error("The breakdown came back incomplete. Please try again.");
  return {
    createdAt: new Date().toISOString(),
    niche,
    audience: input.audience,
    source: {
      id,
      title: v.title,
      channel: v.channel?.title ?? "",
      thumbnail: v.thumbnail,
      views,
      likes: v.stats.likes ?? null,
      comments: v.stats.comments ?? null,
      subscribers: subs,
      durationSec: v.durationSec,
      publishedAt: v.publishedAt,
      multiplier,
      tags: v.tags.slice(0, 15),
    },
    breakdown: {
      summary: str(b.summary, 800),
      packaging: { title: str(pk.title, 500), thumbnail: str(pk.thumbnail, 500) },
      hook: str(b.hook, 500),
      promise: str(b.promise, 400),
      structure: (Array.isArray(b.structure) ? b.structure : [])
        .map((raw) => {
          const r = (raw ?? {}) as Record<string, unknown>;
          return { beat: str(r.beat, 80), purpose: str(r.purpose, 300) };
        })
        .filter((s) => s.beat)
        .slice(0, 16),
      emotions: strs(b.emotions, 40, 6),
      audienceLoved: strs(b.audienceLoved, 300, 6),
      audienceWants: strs(b.audienceWants, 300, 6),
      weaknesses: strs(b.weaknesses, 300, 6),
    },
    blueprint,
    model,
  };
}
