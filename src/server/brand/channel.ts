import { GeminiTextProvider, isTextConfigured } from "@/src/server/ai/gemini";
import { PRODUCT_FACTS } from "@/src/server/support/facts";
import { parseJsonObject } from "@/src/server/admin-ai";
import { PROMO_FEATURES } from "@/src/server/growth/promo";
import { backendUnavailable } from "@/src/server/errors";

/**
 * Recktube's own YouTube channel: a professional channel pack (About text,
 * keywords, playlists, a 30-day content plan and banner art direction),
 * written from the real product facts. Owner only.
 */

export const BRAND = {
  name: "Recktube",
  site: "https://www.recktube.xyz",
  tagline: "From idea to YouTube video, in one studio",
  colors: ["#d946ef", "#7c3aed", "#0ea5e9", "#0b0714"],
  logo: "/recktube-logo-512.png",
};

export interface BrandPlanItem { day: number; title: string; format: "Short" | "Long"; hook: string; feature: string }
export interface BrandChannelPack {
  tagline: string;
  description: string;
  keywords: string;
  playlists: { title: string; description: string }[];
  plan: BrandPlanItem[];
  bannerArt: string;
  generatedAt: string;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const FEATURE_IDS = PROMO_FEATURES.map((f) => f.id as string);

export function normalizeBrandPack(o: Record<string, unknown>): BrandChannelPack {
  const playlists = (Array.isArray(o.playlists) ? o.playlists : [])
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({ title: str(p.title, 150), description: str(p.description, 1000) }))
    .filter((p) => p.title)
    .slice(0, 6);
  const plan = (Array.isArray(o.plan) ? o.plan : [])
    .map((p, i) => p as Record<string, unknown>)
    .map((p, i) => ({
      day: Math.min(30, Math.max(1, Math.round(Number(p.day) || i + 1))),
      title: str(p.title, 100),
      format: (String(p.format).toLowerCase().startsWith("l") ? "Long" : "Short") as "Short" | "Long",
      hook: str(p.hook, 200),
      feature: FEATURE_IDS.includes(String(p.feature)) ? String(p.feature) : "overview",
    }))
    .filter((p) => p.title)
    .slice(0, 30);
  // YouTube keywords: space separated, multi-word phrases quoted, 500 chars max.
  const kw = (Array.isArray(o.keywords) ? o.keywords : String(o.keywords ?? "").split(","))
    .map((k) => str(k, 40).replace(/"/g, ""))
    .filter(Boolean)
    .map((k) => (k.includes(" ") ? `"${k}"` : k));
  let keywords = "";
  for (const k of kw) if ((keywords + " " + k).trim().length <= 500) keywords = (keywords + " " + k).trim();
  return {
    tagline: str(o.tagline, 80) || BRAND.tagline,
    description: str(o.description, 1000),
    keywords,
    playlists,
    plan,
    bannerArt: str(o.bannerArt, 400),
    generatedAt: new Date().toISOString(),
  };
}

export async function writeBrandPack(brief: string): Promise<BrandChannelPack> {
  if (!isTextConfigured()) throw backendUnavailable("AI writing");
  const prompt = `You are the head of content for Recktube's own official YouTube channel. Build a professional channel pack.

${PRODUCT_FACTS}

Features you may feature (use these ids): ${PROMO_FEATURES.map((f) => `${f.id} = ${f.name}: ${f.pitch}`).join("; ")}.
${brief ? `Owner's direction: ${brief.slice(0, 600)}` : ""}

Rules:
- Audience: aspiring and growing YouTube creators. Tone: confident, helpful, never hype. Only real features; no invented stats, prices, testimonials or guarantees.
- description: the channel About text, 600–950 characters, first line is a strong one-sentence promise, include https://www.recktube.xyz once, plain text (no markdown), line breaks allowed.
- keywords: 12–20 search phrases creators use.
- playlists: 4–6 (e.g. tutorials, creator growth tips, feature demos, Shorts), each with a 1–2 sentence description.
- plan: exactly 30 items, one per day, mostly Shorts (about 2 in 3) plus some long tutorials; each has a curiosity-driven title (≤ 70 chars), a first-line hook, and the feature id it shows.
- tagline: ≤ 8 words for the banner.
- bannerArt: an image prompt for a wide, text-free, modern background for a YouTube banner (abstract studio / creator vibe, magenta-violet-blue glow on near-black), no words, no logos, lots of calm space in the centre.

Respond ONLY with JSON:
{"tagline":"","description":"","keywords":[""],"playlists":[{"title":"","description":""}],"plan":[{"day":1,"title":"","format":"Short","hook":"","feature":"overview"}],"bannerArt":""}`;
  const { text } = await new GeminiTextProvider().generateText({ prompt, maxTokens: 6000, json: true });
  return normalizeBrandPack(parseJsonObject(text));
}
