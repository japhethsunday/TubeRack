import { myChannel, myVideos } from "@/src/server/google/channel";
import { getConnection } from "@/src/server/google/oauth";
import { searchVideos } from "@/src/server/youtube/client";
import { GeminiTextProvider } from "@/src/server/ai/gemini";
import { extractJsonObject } from "@/src/lib/ai-gateway/json";

/**
 * Content Creator: studies the connected channel (what actually performs for
 * this audience) and the niche on YouTube right now (what is winning), then
 * writes video ideas grounded in both. Every idea cites the videos it builds
 * on; nothing is invented.
 */

export interface StudiedVideo {
  id: string;
  title: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
  viewsPerDay: number;
  /** Views relative to the channel's (or niche's) median. */
  lift: number;
  channel?: string;
}

export interface ChannelStudy {
  title: string;
  handle: string;
  subscribers: number | null;
  videoCount: number | null;
  analysed: number;
  medianViews: number;
  top: StudiedVideo[];
  under: StudiedVideo[];
  uploadsPerMonth: number;
}

export interface NicheStudy {
  query: string;
  medianViewsPerDay: number;
  leaders: StudiedVideo[];
}

export interface ContentIdea {
  title: string;
  hook: string;
  angle: string;
  format: "Long-form" | "Short";
  pillar: string;
  whyItWorks: string;
  evidence: string[];
  thumbnail: string;
  searchPhrase: string;
  confidence: "High" | "Medium" | "Test";
}

export interface IdeasResult {
  generatedAt: string;
  niche: string;
  channel: ChannelStudy | null;
  market: NicheStudy | null;
  ideas: ContentIdea[];
  model: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const daysSince = (iso: string) => Math.max(1, (Date.now() - new Date(iso).getTime()) / 86_400_000);

async function studyChannel(workspaceId: string): Promise<ChannelStudy | null> {
  const conn = await getConnection(workspaceId).catch(() => null);
  if (!conn) return null;
  const [info, videos] = await Promise.all([myChannel(workspaceId), myVideos(workspaceId, 50)]);
  // Public, published videos with real view counts; very fresh uploads are still settling.
  const usable = videos.filter((v) => v.privacy === "public" && v.views !== null && daysSince(v.publishedAt) >= 2);
  const med = median(usable.map((v) => v.views ?? 0));
  const scored: StudiedVideo[] = usable.map((v) => ({
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail,
    views: v.views ?? 0,
    publishedAt: v.publishedAt,
    viewsPerDay: Math.round((v.views ?? 0) / daysSince(v.publishedAt)),
    lift: med > 0 ? (v.views ?? 0) / med : 0,
  }));
  const byLift = [...scored].sort((a, b) => b.lift - a.lift);
  const span = usable.length > 1 ? daysSince(usable[usable.length - 1].publishedAt) - daysSince(usable[0].publishedAt) : 0;
  return {
    title: info.title,
    handle: info.handle,
    subscribers: info.subscribers,
    videoCount: info.videos,
    analysed: scored.length,
    medianViews: Math.round(med),
    top: byLift.filter((v) => v.lift >= 1.2).slice(0, 6),
    under: byLift.filter((v) => v.lift > 0 && v.lift < 0.6).slice(-4),
    uploadsPerMonth: span > 0 ? Math.round((usable.length / Math.abs(span)) * 30 * 10) / 10 : 0,
  };
}

async function studyNiche(query: string): Promise<NicheStudy | null> {
  const results = await searchVideos(query, 25).catch(() => []);
  const withViews = results.filter((r) => typeof r.views === "number" && r.publishedAt);
  if (!withViews.length) return null;
  const vpd = withViews.map((r) => (r.views ?? 0) / daysSince(r.publishedAt));
  const med = median(vpd);
  const leaders = withViews
    .map((r, i) => ({
      id: r.videoId,
      title: r.title,
      thumbnail: r.thumbnail,
      views: r.views ?? 0,
      publishedAt: r.publishedAt,
      viewsPerDay: Math.round(vpd[i]),
      lift: med > 0 ? vpd[i] / med : 0,
      channel: r.channelTitle,
    }))
    .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
    .slice(0, 10);
  return { query, medianViewsPerDay: Math.round(med), leaders };
}

const FORMATS = new Set(["Long-form", "Short"]);
const CONFIDENCE = new Set(["High", "Medium", "Test"]);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function generateContentIdeas(input: {
  workspaceId: string;
  niche: string;
  audience: string;
  count: number;
  format: "any" | "long" | "short";
  useChannel: boolean;
}): Promise<IdeasResult> {
  const channel = input.useChannel ? await studyChannel(input.workspaceId) : null;
  const niche = input.niche.trim() || channel?.title || "";
  if (!niche) throw new Error("Enter your niche or connect your YouTube channel.");
  const market = await studyNiche(niche);

  const fmtVideo = (v: StudiedVideo, i: number, tag: string) =>
    `[${tag}${i + 1}] "${v.title}"${v.channel ? ` — ${v.channel}` : ""} · ${v.views.toLocaleString("en")} views · ${v.viewsPerDay.toLocaleString("en")}/day · ${v.lift.toFixed(1)}× median`;
  const facts = [
    channel
      ? `THE CREATOR'S CHANNEL "${channel.title}" (${channel.subscribers?.toLocaleString("en") ?? "hidden"} subscribers, ${channel.analysed} recent public videos analysed, median ${channel.medianViews.toLocaleString("en")} views, ~${channel.uploadsPerMonth} uploads/month).\nTheir best performers (above their own median):\n${channel.top.map((v, i) => fmtVideo(v, i, "C")).join("\n") || "none yet"}\nTheir weakest recent videos:\n${channel.under.map((v, i) => fmtVideo(v, i, "W")).join("\n") || "none"}`
      : "No connected channel: plan for a creator entering this niche.",
    market
      ? `WHAT IS WINNING IN "${niche}" ON YOUTUBE NOW (ranked by views/day; niche median ${market.medianViewsPerDay.toLocaleString("en")}/day):\n${market.leaders.map((v, i) => fmtVideo(v, i, "N")).join("\n")}`
      : "No live niche data was available.",
  ].join("\n\n");

  const formatRule =
    input.format === "short" ? "All ideas are YouTube Shorts (under 60s)." : input.format === "long" ? "All ideas are long-form videos." : "Mix mostly long-form with a few Shorts where the idea suits it.";
  const prompt = `You are a senior YouTube content strategist. Write ${input.count} video ideas for this creator in the "${niche}" niche${input.audience ? ` for ${input.audience}` : ""}.

${facts}

How to think:
- Double down on what already works for THIS channel (topics, formats and promises of their best performers) and avoid the patterns of their weakest videos.
- Borrow the demand, not the title: take what is winning in the niche and give it a fresh angle, a sharper promise, or a gap the leaders miss.
- Each idea must be specific (a concrete promise, number, story, or result), deliver what the title promises, and be makeable by a solo creator.
- Vary the ideas: mix proven formats (list, tutorial, story, comparison, challenge, myth-busting, case study, reaction to a trend).
- ${formatRule}
- Never invent statistics, view counts or facts. In "evidence", cite only the bracketed labels above (e.g. "C2", "N4") and say what each shows.

Respond ONLY with JSON:
{"ideas":[{"title":"under 70 chars, keyword near the front","hook":"the first 5 seconds, spoken","angle":"what makes this different","format":"Long-form|Short","pillar":"content pillar","whyItWorks":"1-2 sentences tied to the evidence","evidence":["C1: ...","N3: ..."],"thumbnail":"one-line visual concept, max 4 words of text","searchPhrase":"what viewers type into YouTube","confidence":"High|Medium|Test"}]}`;

  const { text, model } = await new GeminiTextProvider().generateText({ prompt, maxTokens: Math.min(8192, 700 * input.count), json: true });
  const obj = extractJsonObject(text) as { ideas?: unknown[] } | null;
  const ideas = (Array.isArray(obj?.ideas) ? obj!.ideas : [])
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const format = str(r.format, 20);
      const confidence = str(r.confidence, 10);
      return {
        title: str(r.title, 100),
        hook: str(r.hook, 400),
        angle: str(r.angle, 300),
        format: (FORMATS.has(format) ? format : "Long-form") as ContentIdea["format"],
        pillar: str(r.pillar, 60),
        whyItWorks: str(r.whyItWorks, 400),
        evidence: (Array.isArray(r.evidence) ? r.evidence : []).map((e) => str(e, 200)).filter((e) => /^[CNW]\d+/.test(e)).slice(0, 4),
        thumbnail: str(r.thumbnail, 160),
        searchPhrase: str(r.searchPhrase, 100),
        confidence: (CONFIDENCE.has(confidence) ? confidence : "Medium") as ContentIdea["confidence"],
      };
    })
    .filter((i) => i.title && i.hook)
    .slice(0, input.count);
  if (!ideas.length) throw new Error("The idea writer returned nothing usable. Please try again.");
  return { generatedAt: new Date().toISOString(), niche, channel, market, ideas, model };
}
