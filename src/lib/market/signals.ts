/**
 * Most Paying Niches — scoring from measured YouTube samples.
 *
 * Measured (YouTube Data API, per niche + country): views/day, channel
 * sizes, publish dates, durations, YouTube's paid-promotion flag, and links
 * in video descriptions. The one input no public API offers is ad pricing
 * (CPM/RPM); it is represented by an industry advertiser tier, labelled as
 * an estimate everywhere it appears. No dollar figures are invented.
 */

import { daysSince, median, nicheMetrics, nicheScores, type NicheMetrics, type NicheVideoSample } from "@/src/lib/niche/score";

export type CategoryId =
  | "finance" | "insurance" | "legal-tax" | "software" | "real-estate" | "business" | "crypto"
  | "tech-education" | "automotive" | "luxury" | "consumer-tech" | "health" | "beauty" | "home"
  | "travel" | "education" | "food" | "family" | "gaming" | "entertainment";

export interface AdvertiserCategory {
  id: CategoryId;
  label: string;
  /** 1 (lowest) – 5 (highest) relative advertiser demand. Estimate. */
  tier: 1 | 2 | 3 | 4 | 5;
  why: string;
}

/**
 * Industry advertiser tiers: how strongly advertisers in each industry
 * compete for placements (driven by customer lifetime value). Relative
 * ranks, not prices; the actual RPM of a channel is only visible in its
 * own YouTube Analytics.
 */
export const CATEGORIES: Record<CategoryId, AdvertiserCategory> = {
  finance: { id: "finance", label: "Personal finance & investing", tier: 5, why: "Banks, brokers and card issuers pay for high-value customers." },
  insurance: { id: "insurance", label: "Insurance", tier: 5, why: "Insurers compete for long-term policy holders." },
  "legal-tax": { id: "legal-tax", label: "Legal & tax", tier: 5, why: "Law firms and tax services bid for high-value clients." },
  software: { id: "software", label: "Software & SaaS", tier: 5, why: "Subscription software advertises to recurring-revenue buyers." },
  "real-estate": { id: "real-estate", label: "Real estate", tier: 4, why: "Mortgage lenders, brokers and platforms advertise heavily." },
  business: { id: "business", label: "Business & entrepreneurship", tier: 4, why: "B2B tools and services target business owners." },
  crypto: { id: "crypto", label: "Crypto", tier: 4, why: "Exchanges advertise heavily, but brand-safety limits vary by region." },
  "tech-education": { id: "tech-education", label: "Tech skills & programming", tier: 4, why: "Courses, bootcamps and developer tools target learners." },
  automotive: { id: "automotive", label: "Automotive", tier: 4, why: "Car makers and dealers run large campaigns." },
  luxury: { id: "luxury", label: "Luxury goods", tier: 4, why: "High-ticket brands buy premium audiences." },
  "consumer-tech": { id: "consumer-tech", label: "Consumer tech", tier: 3, why: "Electronics brands advertise around launches." },
  health: { id: "health", label: "Health & fitness", tier: 3, why: "Supplement, fitness and health brands advertise; medical claims are restricted." },
  beauty: { id: "beauty", label: "Beauty & skincare", tier: 3, why: "Cosmetics brands spend heavily on video." },
  home: { id: "home", label: "Home & DIY", tier: 3, why: "Tool, appliance and home-service brands advertise." },
  travel: { id: "travel", label: "Travel", tier: 3, why: "Airlines, hotels and booking sites advertise seasonally." },
  education: { id: "education", label: "Education & study", tier: 3, why: "Learning platforms and tutoring services advertise." },
  food: { id: "food", label: "Food & cooking", tier: 2, why: "Consumer food brands advertise at lower bids." },
  family: { id: "family", label: "Parenting & family", tier: 2, why: "Family brands advertise; kids-directed content earns far less." },
  gaming: { id: "gaming", label: "Gaming", tier: 1, why: "Large audiences but lower advertiser bids." },
  entertainment: { id: "entertainment", label: "Entertainment", tier: 1, why: "Broad audiences, lower advertiser bids." },
};

export interface CatalogNiche {
  name: string;
  query: string;
  category: CategoryId;
}

/** Candidate niches ranked by the leaderboard (each is scanned live). */
export const CATALOG: CatalogNiche[] = [
  { name: "Personal finance", query: "personal finance tips", category: "finance" },
  { name: "Investing for beginners", query: "investing for beginners", category: "finance" },
  { name: "Credit cards & credit scores", query: "best credit cards credit score", category: "finance" },
  { name: "Insurance explained", query: "insurance explained", category: "insurance" },
  { name: "Taxes explained", query: "taxes explained", category: "legal-tax" },
  { name: "Real estate investing", query: "real estate investing", category: "real-estate" },
  { name: "Small business", query: "small business tips", category: "business" },
  { name: "Side hustles", query: "side hustle ideas", category: "business" },
  { name: "AI tools", query: "ai tools tutorial", category: "software" },
  { name: "SaaS & productivity software", query: "productivity software review", category: "software" },
  { name: "Programming tutorials", query: "programming tutorial", category: "tech-education" },
  { name: "Cybersecurity", query: "cybersecurity explained", category: "software" },
  { name: "Website building", query: "how to build a website", category: "software" },
  { name: "Crypto", query: "crypto news", category: "crypto" },
  { name: "Tech reviews", query: "tech review", category: "consumer-tech" },
  { name: "PC building", query: "pc build guide", category: "consumer-tech" },
  { name: "Car reviews", query: "car review", category: "automotive" },
  { name: "Electric vehicles", query: "electric vehicle review", category: "automotive" },
  { name: "Watches & luxury", query: "luxury watch review", category: "luxury" },
  { name: "Fitness", query: "home workout", category: "health" },
  { name: "Nutrition & weight loss", query: "weight loss diet", category: "health" },
  { name: "Skincare", query: "skincare routine", category: "beauty" },
  { name: "Home improvement", query: "home improvement diy", category: "home" },
  { name: "Travel", query: "travel guide", category: "travel" },
  { name: "Study tips", query: "study tips", category: "education" },
  { name: "Language learning", query: "learn english", category: "education" },
  { name: "Cooking", query: "easy recipes", category: "food" },
  { name: "Parenting", query: "parenting tips", category: "family" },
  { name: "Gaming", query: "gaming", category: "gaming" },
  { name: "True crime", query: "true crime documentary", category: "entertainment" },
];

// ---------- description signals (measured) ----------

const SPONSOR = /\b(sponsored by|this video is sponsored|thanks to .{1,40} for sponsoring|use (my )?code|promo code|discount code|partnered with|#ad\b|#sponsored)/i;
const AFFILIATE = /(amzn\.to|amazon\.[a-z.]+\/[^\s]*tag=|geni\.us|\baffiliate\b|commission|shareasale|impact\.com|awin1\.com|clickbank|\?ref=|&ref=|\?aff=|go\.[a-z]+\.com\/)/i;
const DIGITAL = /(gumroad|patreon\.com|stan\.store|teachable|kajabi|skool\.com|podia|thinkific|buymeacoffee|ko-fi\.com|lemonsqueezy|payhip|\b(my|the) (course|ebook|e-book|templates?|masterclass|newsletter|community|coaching)\b)/i;

export interface MarketSample extends NicheVideoSample {
  sponsored: boolean;
  affiliate: boolean;
  digital: boolean;
}

export function descriptionSignals(description: string, paidPlacement: boolean): Pick<MarketSample, "sponsored" | "affiliate" | "digital"> {
  return { sponsored: paidPlacement || SPONSOR.test(description), affiliate: AFFILIATE.test(description), digital: DIGITAL.test(description) };
}

// ---------- profile ----------

export const SHORT_MAX_SEC = 180;

export interface MarketMeasures {
  metrics: NicheMetrics;
  sponsoredShare: number;
  affiliateShare: number;
  digitalShare: number;
  recentShare: number; // share of the window's top videos published in the last 60 days
  shortsViewsPerDay: number | null;
  longViewsPerDay: number | null;
  shortsCount: number;
  longCount: number;
  medianLongMinutes: number | null;
}

export interface MarketScores {
  earning: number;
  advertiser: number; // estimate (tier)
  demand: number;
  competition: number;
  difficulty: number;
  monetisation: number;
  affiliate: number;
  sponsorship: number;
  digital: number;
  growth: number;
  shortForm: number;
  longForm: number;
  youtube: number;
  overall: number;
}

export interface Angle {
  title: string;
  channelTitle: string;
  views: number;
  viewsPerDay: number;
  channelSubs: number | null;
  videoId: string;
}

export interface NicheProfile {
  name: string;
  query: string;
  region: string;
  category: AdvertiserCategory;
  measures: MarketMeasures;
  scores: MarketScores;
  reasons: string[];
  angles: Angle[];
  scannedAt: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.round(Math.max(lo, Math.min(hi, n)));
const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : 0);
const vpd = (s: NicheVideoSample, now: number) => s.views / daysSince(s.publishedAt, now);
const logScore = (v: number) => clamp(((Math.log10(v + 1) - 1) / 4) * 100); // 10/day → 0, 100k/day → 100

export function marketMeasures(samples: MarketSample[], totalResults: number | null, now = Date.now()): MarketMeasures {
  const shorts = samples.filter((s) => s.durationSec !== null && s.durationSec <= SHORT_MAX_SEC);
  const longs = samples.filter((s) => s.durationSec !== null && s.durationSec > SHORT_MAX_SEC);
  const recent = samples.filter((s) => daysSince(s.publishedAt, now) <= 60);
  return {
    metrics: nicheMetrics(samples, totalResults, now),
    sponsoredShare: share(samples.map((s) => s.sponsored)),
    affiliateShare: share(samples.map((s) => s.affiliate)),
    digitalShare: share(samples.map((s) => s.digital)),
    recentShare: samples.length ? recent.length / samples.length : 0,
    shortsViewsPerDay: shorts.length ? Math.round(median(shorts.map((s) => vpd(s, now)))) : null,
    longViewsPerDay: longs.length ? Math.round(median(longs.map((s) => vpd(s, now)))) : null,
    shortsCount: shorts.length,
    longCount: longs.length,
    medianLongMinutes: longs.length ? Math.round(median(longs.map((s) => (s.durationSec ?? 0) / 60)) * 10) / 10 : null,
  };
}

export type PlatformFocus = "youtube" | "long" | "shorts";

export function marketScores(m: MarketMeasures, category: AdvertiserCategory, focus: PlatformFocus = "youtube"): MarketScores {
  const base = nicheScores(m.metrics);
  const advertiser = category.tier * 20;
  const sponsorship = clamp(m.sponsoredShare * 250);
  const affiliate = clamp(m.affiliateShare * 200);
  const digital = clamp(m.digitalShare * 250);
  const monetisation = clamp((sponsorship + affiliate + digital) / 3);
  const shortForm = m.shortsCount ? clamp(logScore(m.shortsViewsPerDay ?? 0) * 0.7 + (m.shortsCount / Math.max(1, m.metrics.sampleSize)) * 100 * 0.3) : 0;
  const longForm = m.longCount ? clamp(logScore(m.longViewsPerDay ?? 0) * 0.7 + (m.longCount / Math.max(1, m.metrics.sampleSize)) * 100 * 0.3) : 0;
  const demand = focus === "shorts" ? shortForm : focus === "long" ? longForm : base.demand;
  // 60 of 180 days = 33% expected share for a flat niche.
  const growth = m.metrics.sampleSize ? clamp(50 + (m.recentShare - 0.33) * 150) : 0;
  const difficulty = clamp((m.medianLongMinutes ?? 8) * 2.5 + m.metrics.bigChannelShare * 50);
  const earning = clamp(advertiser * 0.45 + monetisation * 0.3 + demand * 0.25);
  const youtube = clamp(Math.max(shortForm, longForm) * 0.6 + base.opportunity * 0.4);
  const overall = clamp(earning * 0.35 + demand * 0.2 + (100 - base.competition) * 0.2 + growth * 0.15 + (100 - difficulty) * 0.1);
  return { earning, advertiser, demand, competition: base.competition, difficulty, monetisation, affiliate, sponsorship, digital, growth, shortForm, longForm, youtube, overall };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** Plain reasons built only from measured numbers and the labelled tier. */
export function rankingReasons(m: MarketMeasures, s: MarketScores, category: AdvertiserCategory): string[] {
  const n = m.metrics.sampleSize;
  const out: string[] = [];
  out.push(`${category.label}: advertiser tier ${category.tier}/5 (estimate). ${category.why}`);
  out.push(`Top videos average ${fmt(m.metrics.medianViewsPerDay)} views/day (median of ${n}).`);
  if (m.sponsoredShare > 0) out.push(`${pct(m.sponsoredShare)} of top videos carry paid promotions.`);
  if (m.affiliateShare > 0) out.push(`${pct(m.affiliateShare)} link to affiliate programmes.`);
  if (m.digitalShare > 0) out.push(`${pct(m.digitalShare)} sell or promote their own products (courses, templates, memberships).`);
  out.push(
    m.metrics.smallChannelWinners > 0
      ? `${m.metrics.smallChannelWinners} of ${n} top videos come from channels under 100k subscribers that out-viewed their size.`
      : `No channel under 100k subscribers out-viewed its size in the top ${n} — established channels dominate.`,
  );
  out.push(s.growth >= 60 ? `Rising: ${pct(m.recentShare)} of the top videos were published in the last 60 days.` : s.growth <= 40 ? `Mature: only ${pct(m.recentShare)} of the top videos are from the last 60 days.` : `Steady: ${pct(m.recentShare)} of the top videos are from the last 60 days.`);
  return out;
}

/** Content angles proven by the sample: best views/day, small channels first. */
export function provenAngles(samples: MarketSample[], now = Date.now(), max = 6): Angle[] {
  return [...samples]
    .map((s) => ({ s, v: vpd(s, now), small: s.channelSubs !== null && s.channelSubs < 100_000 }))
    .sort((a, b) => Number(b.small) - Number(a.small) || b.v - a.v)
    .slice(0, max)
    .map(({ s, v }) => ({ title: s.title, channelTitle: s.channelTitle, views: s.views, viewsPerDay: Math.round(v), channelSubs: s.channelSubs, videoId: s.videoId }));
}

export function buildProfile(input: {
  name: string;
  query: string;
  region: string;
  category: CategoryId;
  samples: MarketSample[];
  totalResults: number | null;
  scannedAt: string;
  focus?: PlatformFocus;
  now?: number;
}): NicheProfile {
  const now = input.now ?? Date.now();
  const category = CATEGORIES[input.category];
  const measures = marketMeasures(input.samples, input.totalResults, now);
  const scores = marketScores(measures, category, input.focus);
  return {
    name: input.name,
    query: input.query,
    region: input.region,
    category,
    measures,
    scores,
    reasons: rankingReasons(measures, scores, category),
    angles: provenAngles(input.samples, now),
    scannedAt: input.scannedAt,
  };
}

/** Best-effort category for a custom niche from its wording (user can change it). */
export function guessCategory(text: string): CategoryId {
  const t = text.toLowerCase();
  const rules: [RegExp, CategoryId][] = [
    [/insur/, "insurance"], [/tax|legal|law|lawyer|attorney/, "legal-tax"], [/crypto|bitcoin|ethereum|web3/, "crypto"],
    [/financ|invest|stock|money|budget|credit|debt|retire|dividend|trading|bank/, "finance"],
    [/real estate|property|mortgage|landlord|airbnb/, "real-estate"], [/saas|software|ai tool|\bai\b|app review|cyber|hosting|website|no-?code/, "software"],
    [/coding|programming|developer|python|javascript|data science|excel/, "tech-education"], [/business|startup|entrepreneur|marketing|side hustle|ecommerce|dropship/, "business"],
    [/car|vehicle|\bev\b|motor|truck/, "automotive"], [/watch|luxury|designer|yacht/, "luxury"], [/phone|laptop|pc|gadget|tech|camera|headphone/, "consumer-tech"],
    [/fitness|workout|gym|diet|weight|nutrition|health|yoga|running|mental/, "health"], [/skin|makeup|beauty|hair|fashion/, "beauty"],
    [/diy|home|garden|renovat|woodwork|interior/, "home"], [/travel|trip|hotel|flight|vanlife/, "travel"], [/study|learn|language|school|exam|education|tutor/, "education"],
    [/cook|recipe|food|baking|kitchen/, "food"], [/parent|baby|kids|mom|dad|family/, "family"], [/game|gaming|minecraft|fortnite|esports/, "gaming"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "entertainment";
}

export const METHODOLOGY = [
  "Sample: the most-viewed YouTube videos matching the niche's search phrase, published in the last 180 days, in the selected country (YouTube Data API, refreshed at most once every 24 hours).",
  "Demand: median views per day of those videos (log scale: 10/day = 0, 100k/day = 100). Long-form and Shorts demand use only videos of that format (Shorts = 3 minutes or less).",
  "Competition: median subscriber count of the ranking channels blended with the share of channels over 1M subscribers.",
  "Growth: share of the 180-day top videos published in the last 60 days. A flat niche would sit near 33%; newer videos have had less time to collect views, so a high share is a strong signal.",
  "Sponsorship, affiliate and digital-product potential: share of the top videos that YouTube flags as paid promotions or whose descriptions contain sponsor codes, affiliate links, or links to courses, templates, memberships or stores.",
  "Advertiser demand / CPM potential: an industry tier (1–5) based on how strongly advertisers in that industry compete for viewers. It is an estimate, not a measured CPM — no public API reports ad prices. Your real RPM appears in your channel's YouTube Analytics once monetised.",
  "Content difficulty: median length of long-form top videos and how much of the space big channels hold (production expectations).",
  "Earning potential = 45% advertiser tier + 30% monetisation signals + 25% demand. Overall = 35% earning + 20% demand + 20% low competition + 15% growth + 10% ease.",
  "Not available from any public API, so not shown: TikTok and Instagram metrics, actual CPM/RPM, sponsorship rates.",
];
