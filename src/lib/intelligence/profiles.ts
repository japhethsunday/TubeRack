/**
 * Audience profile + strategy brief builders — Phase 5.
 * Structured data assembled from creator input (never generated prose).
 * Saved per project; consumed later by Script, Thumbnail, SEO, Repurposing.
 */

export const AUDIENCE_FIELDS = [
  { key: "primary", label: "Primary audience" },
  { key: "problem", label: "Core problem" },
  { key: "desire", label: "Desired outcome" },
  { key: "knowledge", label: "Knowledge level" },
  { key: "intent", label: "Viewing intent" },
  { key: "objections", label: "Objections" },
  { key: "pains", label: "Pain points" },
  { key: "transformation", label: "Desired transformation" },
  { key: "triggers", label: "Emotional triggers" },
  { key: "clickReasons", label: "Why they would click" },
  { key: "leaveReasons", label: "Why they might leave" },
] as const;

export type AudienceFieldKey = (typeof AUDIENCE_FIELDS)[number]["key"];
export type AudienceProfile = Record<AudienceFieldKey, string> & { updatedAt: string };

export function emptyAudienceProfile(at?: string): AudienceProfile {
  const profile = { updatedAt: at ?? new Date().toISOString() } as AudienceProfile;
  for (const f of AUDIENCE_FIELDS) profile[f.key] = "";
  return profile;
}

export function audienceCompleteness(profile: AudienceProfile): number {
  const filled = AUDIENCE_FIELDS.filter((f) => profile[f.key].trim().length > 0).length;
  return Math.round((filled / AUDIENCE_FIELDS.length) * 100);
}

export function missingAudienceFields(profile: AudienceProfile): string[] {
  return AUDIENCE_FIELDS.filter((f) => profile[f.key].trim().length === 0).map((f) => f.label);
}

export const STRATEGY_FIELDS = [
  { key: "topic", label: "Core topic" },
  { key: "angle", label: "Content angle" },
  { key: "positioning", label: "Positioning" },
  { key: "promise", label: "Promise" },
  { key: "takeaway", label: "Main takeaway" },
  { key: "points", label: "Supporting points" },
  { key: "hook", label: "Hook direction" },
  { key: "narrative", label: "Narrative direction" },
  { key: "format", label: "Recommended format" },
  { key: "length", label: "Suggested length" },
  { key: "intent", label: "Audience intent" },
  { key: "differentiation", label: "Differentiation strategy" },
  { key: "cta", label: "CTA direction" },
] as const;

export type StrategyFieldKey = (typeof STRATEGY_FIELDS)[number]["key"];
export type StrategyBrief = Record<StrategyFieldKey, string> & { updatedAt: string };

export function emptyStrategyBrief(at?: string): StrategyBrief {
  const brief = { updatedAt: at ?? new Date().toISOString() } as StrategyBrief;
  for (const f of STRATEGY_FIELDS) brief[f.key] = "";
  return brief;
}

export function strategyCompleteness(brief: StrategyBrief): number {
  const filled = STRATEGY_FIELDS.filter((f) => brief[f.key].trim().length > 0).length;
  return Math.round((filled / STRATEGY_FIELDS.length) * 100);
}

export function missingStrategyFields(brief: StrategyBrief): string[] {
  return STRATEGY_FIELDS.filter((f) => brief[f.key].trim().length === 0).map((f) => f.label);
}

/** Production brief: assembles idea + audience + strategy + DNA into one handoff. */
export function buildProductionBrief(input: {
  idea: string;
  audience: AudienceProfile;
  strategy: StrategyBrief;
  dnaSummary: string;
}): string {
  const lines = [
    `# Production brief`,
    ``,
    `## Idea`,
    input.idea.trim() || "(none)",
    ``,
    `## Audience`,
    ...AUDIENCE_FIELDS.filter((f) => input.audience[f.key].trim()).map(
      (f) => `- ${f.label}: ${input.audience[f.key].trim()}`,
    ),
    ``,
    `## Strategy`,
    ...STRATEGY_FIELDS.filter((f) => input.strategy[f.key].trim()).map(
      (f) => `- ${f.label}: ${input.strategy[f.key].trim()}`,
    ),
  ];
  if (input.dnaSummary.trim()) {
    lines.push(``, `## Channel DNA`, input.dnaSummary.trim());
  }
  lines.push(``, `_Assembled locally from creator input. AI reasoning connects in Phase 11._`);
  return lines.join("\n");
}
