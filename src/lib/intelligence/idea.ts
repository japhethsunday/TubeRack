/**
 * Idea analysis + angle discovery — Phase 5.
 * Deterministic heuristics over creator-supplied input with a disclosed
 * methodology. Qualitative ratings (strong / developing / gap) only —
 * never fake numeric scores, never generated claims.
 */

export type DimensionRating = "strong" | "developing" | "gap";

export interface IdeaInput {
  idea: string;
  audience?: string;
  problem?: string;
  differentiation?: string;
}

export interface DimensionResult {
  dimension: string;
  rating: DimensionRating;
  strength: string;
  risk: string;
  opportunity: string;
  recommendation: string;
}

export const IDEA_METHODOLOGY =
  "Local heuristic preview (no AI provider). Each dimension is rated from what you entered: " +
  "“strong” means the input covers it concretely (12+ characters naming who/what), " +
  "“developing” means mentioned but vague (under 12 characters), “gap” means missing. " +
  "Reasoning in Phase 11 will replace these rules; the structure stays.";

function len(v?: string): number {
  return v?.trim().length ?? 0;
}

function rate(v: string | undefined, bar = 12): DimensionRating {
  const n = len(v);
  if (n >= bar) return "strong";
  if (n > 0) return "developing";
  return "gap";
}

function quote(v: string | undefined, fallback: string): string {
  const t = v?.trim();
  return t ? `“${t.length > 90 ? `${t.slice(0, 90)}…` : t}”` : fallback;
}

export function analyzeIdea(input: IdeaInput): { dimensions: DimensionResult[]; summary: string } {
  const idea = input.idea.trim();
  const words = idea.split(/\s+/).filter(Boolean).length;
  const dims: DimensionResult[] = [
    {
      dimension: "Audience relevance",
      rating: rate(input.audience),
      strength: input.audience?.trim()
        ? `Names an audience: ${quote(input.audience, "")}.`
        : "No audience named yet.",
      risk: input.audience?.trim() ? "A named audience can still be too broad to hook." : "Without an audience, every later choice is a guess.",
      opportunity: "Borrow the audience's own words for the title and hook.",
      recommendation: input.audience?.trim() ? "Narrow to one viewer and one viewing moment." : "Add who this is for before anything else.",
    },
    {
      dimension: "Problem strength",
      rating: rate(input.problem, 20),
      strength: input.problem?.trim() ? `States a problem: ${quote(input.problem, "")}.` : "No problem articulated.",
      risk: "Weak problems produce polite interest, not clicks.",
      opportunity: "Quantify the cost of the problem (time, money, embarrassment).",
      recommendation: input.problem?.trim() ? "Make the cost of ignoring it explicit in the hook." : "Write the viewer's problem in one sentence.",
    },
    {
      dimension: "Curiosity",
      rating: words >= 6 ? (/\?|versus|vs\.?|mistake|secret|truth|why|how/i.test(idea) ? "strong" : "developing") : "gap",
      strength: "The idea carries an information gap the viewer can feel.",
      risk: "Curiosity without payoff reads as clickbait.",
      opportunity: "Plant one open loop the video is guaranteed to close.",
      recommendation: "Phrase the idea as a question the viewer already asks.",
    },
    {
      dimension: "Differentiation",
      rating: rate(input.differentiation, 20),
      strength: input.differentiation?.trim() ? `Claims a distinct angle: ${quote(input.differentiation, "")}.` : "No stated difference from existing videos.",
      risk: "Undifferentiated ideas compete purely on packaging.",
      opportunity: "Compare against the top 3 videos on this topic (add them in Content gaps).",
      recommendation: input.differentiation?.trim() ? "Sharpen it into the title's contrast." : "Name what existing videos get wrong or skip.",
    },
    {
      dimension: "Emotional relevance",
      rating: /fear|frustrat|embarrass|dream|love|hate|anxious|excited|relief|angry/i.test(`${idea} ${input.problem ?? ""}`) ? "strong" : "developing",
      strength: "Emotional stakes make retention cheaper.",
      risk: "Manufactured emotion backfires; keep it earned.",
      opportunity: "Mirror the viewer's feeling in the first 15 seconds.",
      recommendation: "Name the feeling explicitly in the hook direction.",
    },
    {
      dimension: "Educational value",
      rating: words >= 10 ? "strong" : words >= 4 ? "developing" : "gap",
      strength: `${words} words of raw material to structure.`,
      risk: "Thin ideas pad into slow middles.",
      opportunity: "Split the idea into 3 teachable beats for the storyboard.",
      recommendation: words >= 10 ? "Extract the 3 beats now, in Strategy." : "Expand the idea past 10 words before producing.",
    },
    {
      dimension: "Search / discovery potential",
      rating: /\b(how|what|why|best|vs|tutorial|guide|mistakes?|tips?)\b/i.test(idea) ? "strong" : "developing",
      strength: "Discovery phrasing is present.",
      risk: "Search demand is unverified until research connects (Phase 6/11).",
      opportunity: "Pair one searchable title with one browse-curiosity variant.",
      recommendation: "Draft both title directions in Title intelligence.",
    },
    {
      dimension: "Competition",
      rating: "developing",
      strength: "Local catalog comparison is available in Content gaps.",
      risk: "Competing videos are unknown until references are entered — nothing here is measured.",
      opportunity: "Add 3 competing videos to see angle coverage honestly.",
      recommendation: "Open Content gaps before committing to production.",
    },
    {
      dimension: "Content depth",
      rating: words >= 15 ? "strong" : words >= 7 ? "developing" : "gap",
      strength: words >= 7 ? "Enough substance for a mid-length video." : "Too thin to sustain a video yet.",
      risk: "Thin ideas become repetitive middles.",
      opportunity: "Depth compounds: each sub-point is a future short.",
      recommendation: words >= 15 ? "Map depth to scenes in the storyboard." : "Add sub-points or examples first.",
    },
    {
      dimension: "Longevity",
      rating: /\b(2024|2025|2026|trend|news|this week|viral)\b/i.test(idea) ? "developing" : "strong",
      strength: "Evergreen ideas compound for years.",
      risk: "Trend-tied ideas decay fast — fine if deliberate.",
      opportunity: "Frame trends inside an evergreen question.",
      recommendation: "Decide: evergreen asset or timely spike, then package accordingly.",
    },
  ];

  const strong = dims.filter((d) => d.rating === "strong").length;
  const gaps = dims.filter((d) => d.rating === "gap").length;
  return {
    dimensions: dims,
    summary:
      gaps === 0
        ? `Solid foundation: ${strong} of 10 dimensions strong. Tighten the developing ones in Strategy.`
        : `${strong} of 10 dimensions strong, ${gaps} missing. Fill the gaps before scripting — that is the cheapest place to fix a video.`,
  };
}

export interface Angle {
  category: string;
  what: string;
  whyItWorks: string;
  audienceNeed: string;
  risk: string;
  hookDirection: string;
}

const ANGLE_DEFS: (Omit<Angle, "hookDirection"> & { hook: string })[] = [
  { category: "Educational", what: "Teach the concept completely.", whyItWorks: "Compounds via search for years.", audienceNeed: "Understanding.", risk: "Can feel like a lecture without stakes.", hook: "The one {topic} idea that changes everything" },
  { category: "Tutorial", what: "Step-by-step system the viewer follows.", whyItWorks: "Highest save/share intent.", audienceNeed: "A result, fast.", risk: "Skippable if steps are generic.", hook: "Copy my {topic} setup in 10 minutes" },
  { category: "Story", what: "A personal experience carrying the lesson.", whyItWorks: "Narrative holds attention structurally.", audienceNeed: "Emotional proof.", risk: "Story must earn its runtime.", hook: "How {topic} cost me a year" },
  { category: "Case study", what: "One example dissected in depth.", whyItWorks: "Specificity beats generality.", audienceNeed: "Evidence it works.", risk: "Narrow sample can feel ungeneralizable.", hook: "I tested {topic} for 30 days" },
  { category: "Analysis", what: "Break down why something works or fails.", whyItWorks: "Positions you as the expert.", audienceNeed: "Deeper understanding.", risk: "Analysis without a takeaway drifts.", hook: "Why {topic} actually works" },
  { category: "Comparison", what: "Two or more approaches head-to-head.", whyItWorks: "Decisions are inherently watchable.", audienceNeed: "Which to choose.", risk: "Needs genuine testing to be fair.", hook: "{topic}: honest method A vs method B" },
  { category: "Contrarian", what: "Challenge the accepted advice.", whyItWorks: "Disagreement drives clicks and comments.", audienceNeed: "Permission to think differently.", risk: "Must be defensible, not just loud.", hook: "Stop doing {topic} this way" },
  { category: "List", what: "Ranked or grouped points.", whyItWorks: "Scannable promise, easy retention.", audienceNeed: "Quick wins.", risk: "Listicles blend together.", hook: "7 {topic} mistakes killing your growth" },
  { category: "Breakdown", what: "Take apart a famous example.", whyItWorks: "Borrows interest from known work.", audienceNeed: "Steal-what-works tactics.", risk: "Needs rights-safe, original commentary.", hook: "Stealing the {topic} playbook" },
  { category: "Investigation", what: "Dig into what others missed.", whyItWorks: "Originality is the moat.", audienceNeed: "The real story.", risk: "Research cost is real — scope it.", hook: "What nobody tells you about {topic}" },
  { category: "News / Trend", what: "React to something happening now.", whyItWorks: "Rides existing attention.", audienceNeed: "Keep me current.", risk: "Decays fast; publish quickly.", hook: "{topic} just changed — here's what matters" },
  { category: "Problem / Solution", what: "Name the pain, deliver the fix.", whyItWorks: "Mirrors the viewer's search.", audienceNeed: "Relief.", risk: "Generic fixes disappoint.", hook: "Fix your {topic} problem today" },
];

/** All 12 angles with the creator's topic slotted in. Fixed order, no fake ranking. */
export function suggestAngles(topic: string): Angle[] {
  const t = topic.trim() || "your topic";
  return ANGLE_DEFS.map((a) => ({
    category: a.category,
    what: a.what,
    whyItWorks: a.whyItWorks,
    audienceNeed: a.audienceNeed,
    risk: a.risk,
    hookDirection: a.hook.replaceAll("{topic}", t),
  }));
}
