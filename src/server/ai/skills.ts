/**
 * Expert skills for every AI in TubeRack. Each is a compact professional
 * playbook added to the instructions of the requests that need it, so every
 * model (and every backup model) works to the same standard. Kept short on
 * purpose: rules that change the output, not essays.
 */

export type SkillId = "content" | "youtube" | "marketing" | "product" | "influencer" | "copy" | "honesty";

const SKILLS: Record<SkillId, { title: string; rules: string[] }> = {
  honesty: {
    title: "Professional standards",
    rules: [
      "Never invent statistics, view counts, earnings, rankings, quotes or sources. Use only numbers given in the input; otherwise speak qualitatively.",
      "Never promise results (views, income, virality). Describe what improves the odds and why.",
      "No hype words or filler (\"game-changer\", \"unlock\", \"dive in\", \"in today's video\"). Plain, confident, specific language.",
      "Respect platform policies: no misleading clickbait, no medical/financial guarantees, disclose sponsorships and affiliate links.",
      "Write like a seasoned human professional; never mention being an AI.",
    ],
  },
  content: {
    title: "Content creation skill",
    rules: [
      "Every piece has one clear promise to one specific viewer; cut anything that doesn't serve it.",
      "Hook in the first 5 seconds: state the payoff or open a loop the video will close. No greetings or channel intros first.",
      "Structure for retention: hook → stakes/why it matters → the promised value in escalating steps → re-hooks every 60-90s (\"but here's the part most people miss\") → payoff → one clear next action.",
      "Show, don't tell: concrete examples, numbers from the input, mini-stories, before/after. One idea per sentence; write for the ear (short sentences, spoken rhythm).",
      "Visual thinking: every line should suggest what is on screen; change the visual every few seconds in fast formats.",
      "End strong: deliver the payoff, then a single CTA tied to the next logical video, not a generic \"like and subscribe\".",
    ],
  },
  youtube: {
    title: "YouTube growth skill",
    rules: [
      "Packaging first: the title and thumbnail are one idea; the thumbnail shows the emotion or result, the title adds the missing context. Never repeat the title text in the thumbnail.",
      "Titles: under 60 characters where possible, main searchable keyword near the front, a concrete payoff, curiosity without deception.",
      "Descriptions: the first two lines hook and contain the main keyword (shown in search); then value, chapters, links, one CTA.",
      "Ideas win on demand x differentiation: borrow proven demand from what's working, change the angle, format or promise.",
      "Shorts: hook in the first second, one idea, loopable ending; long-form: depth, story and payoff.",
      "Optimise for click-through AND watch time: a title that over-promises kills retention and reach.",
    ],
  },
  marketing: {
    title: "Marketing skill",
    rules: [
      "Lead with the audience's problem and desired outcome, in their words, before features.",
      "Use proven frameworks where they fit: Problem-Agitate-Solve, Before-After-Bridge, AIDA; benefits over features; one message per piece.",
      "Positioning: be specific about who it is for (and not for) and why it is different from alternatives.",
      "Social proof and specificity beat adjectives; use only proof provided in the input.",
      "Every asset has one measurable goal and one call to action; match the CTA to the viewer's stage (discover, consider, buy).",
      "Adapt to the channel: platform limits, tone and format (hashtags, hooks, captions) for each network.",
    ],
  },
  product: {
    title: "Digital product skill",
    rules: [
      "Products solve one painful, specific problem for a defined buyer; name the transformation (from X to Y) and the fastest path to the first win.",
      "Build a value ladder from content: free lead magnet → low-ticket product (template, guide, mini-course) → core offer → premium/community.",
      "Validate before building: audience questions, comments, search demand and pre-sales; start small and iterate.",
      "Offers: clear deliverables, outcome, time to result, bonuses that remove objections, honest guarantee; price by value and audience, never by guesswork.",
      "Weave products into content naturally: teach the what and why for free, sell the how/shortcut; one soft mention mid-video, one clear CTA at the end.",
    ],
  },
  influencer: {
    title: "Creator & influencer business skill",
    rules: [
      "Personal brand = consistent niche, point of view, format and visual identity; trust compounds with consistency.",
      "Community first: reply to comments, ask questions viewers want to answer, turn comments into future videos.",
      "Monetisation mix: ad revenue, sponsorships (fit the audience, clear disclosure), affiliates, own products, memberships; don't depend on one.",
      "Sponsor-ready: know the audience profile, integrate sponsors as useful segments, never endorse what you wouldn't use.",
      "Repurpose every long video into Shorts, posts and threads adapted to each platform; collaborate with creators of similar size in adjacent niches.",
    ],
  },
  copy: {
    title: "Copywriting skill",
    rules: [
      "Clear beats clever. Active voice, concrete nouns, strong verbs, short sentences.",
      "Write to one reader (\"you\"), in their language; cut every word that doesn't earn its place.",
      "Open with the most interesting true thing; close with a specific next step.",
    ],
  },
};

/** Skills text for a request (empty when none). */
export function skillsFor(ids: SkillId[] | undefined): string {
  if (!ids?.length) return "";
  const unique = [...new Set<SkillId>(["honesty", ...ids])];
  return (
    unique.map((id) => `${SKILLS[id].title}:\n${SKILLS[id].rules.map((r) => `- ${r}`).join("\n")}`).join("\n\n") +
    "\n\nApply these skills to the task below.\n\n"
  );
}

/** Which skills an intelligence task needs. */
export function skillsForTask(task: string): SkillId[] {
  if (/thumbnail|title|seo|package|hook|retention/.test(task)) return ["youtube", "copy", "content"];
  if (/platform|repurpose|social|caption/.test(task)) return ["marketing", "influencer", "copy"];
  if (/audience|competitive|strategy|topic|niche|gap|trend|idea/.test(task)) return ["youtube", "marketing", "influencer"];
  if (/brief|script|outline/.test(task)) return ["content", "youtube"];
  if (/product|offer|monet/.test(task)) return ["product", "marketing"];
  return ["youtube", "content"];
}
