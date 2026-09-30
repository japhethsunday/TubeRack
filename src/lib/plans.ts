/**
 * Plans and which tools each one includes. Shared by the server (which
 * enforces it) and the app (which shows lock badges and upgrade prompts).
 * A plan is worked out from the workspace's monthly credit allowance.
 */

export type Tier = "free" | "creator" | "pro" | "studio";

export const TIER_ORDER: Tier[] = ["free", "creator", "pro", "studio"];
export const TIER_NAME: Record<Tier, string> = { free: "Free", creator: "Creator", pro: "Pro", studio: "Studio" };

export function tierOf(state: { unlimited?: boolean; monthlyGrant?: number } | null | undefined): Tier {
  if (!state) return "free";
  if (state.unlimited) return "studio";
  const g = Number(state.monthlyGrant ?? 0);
  if (g >= 7000) return "studio";
  if (g >= 3000) return "pro";
  if (g > 100) return "creator";
  return "free";
}

export const atLeast = (have: Tier, need: Tier) => TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(need);

export type Feature =
  | "storyboard"
  | "paying-niches"
  | "scheduling"
  | "brand"
  | "design"
  | "tiktok"
  | "ai-clips"
  | "clean-export"
  | "recreator"
  | "competitors"
  | "gaps"
  | "audience"
  | "retention"
  | "strategy"
  | "abtest"
  | "channel-creator";

export const FEATURES: Record<Feature, { tier: Tier; label: string }> = {
  storyboard: { tier: "creator", label: "Storyboard" },
  "paying-niches": { tier: "creator", label: "Most Paying Niches" },
  scheduling: { tier: "creator", label: "Scheduling and the content calendar" },
  brand: { tier: "creator", label: "Brand kit" },
  design: { tier: "creator", label: "Design" },
  tiktok: { tier: "creator", label: "TikTok posting" },
  "ai-clips": { tier: "creator", label: "AI video clips and motion" },
  "clean-export": { tier: "creator", label: "1080p exports without a watermark" },
  recreator: { tier: "pro", label: "Video Recreator" },
  competitors: { tier: "pro", label: "Competitor analysis" },
  gaps: { tier: "pro", label: "Content Gaps" },
  audience: { tier: "pro", label: "Audience analysis" },
  retention: { tier: "pro", label: "Retention analysis" },
  strategy: { tier: "pro", label: "Channel Strategy" },
  abtest: { tier: "pro", label: "A/B testing" },
  "channel-creator": { tier: "pro", label: "Channel Creator" },
};

/** App pages that belong to a plan feature. */
export const ROUTE_FEATURES: [prefix: string, feature: Feature][] = [
  ["/studio/storyboard", "storyboard"],
  ["/intelligence/paying-niches", "paying-niches"],
  ["/calendar", "scheduling"],
  ["/brand", "brand"],
  ["/design", "design"],
  ["/video-recreator", "recreator"],
  ["/intelligence/competitors", "competitors"],
  ["/intelligence/gaps", "gaps"],
  ["/intelligence/audience", "audience"],
  ["/intelligence/retention", "retention"],
  ["/intelligence/strategy", "strategy"],
  ["/studio/abtest", "abtest"],
  ["/channel-creator", "channel-creator"],
];

export function featureForPath(path: string): Feature | null {
  const hit = ROUTE_FEATURES.find(([p]) => path === p || path.startsWith(`${p}/`));
  return hit ? hit[1] : null;
}

/** Intelligence tasks that belong to a paid tool. */
export const TASK_FEATURES: Record<string, Feature> = {
  "audience-analysis": "audience",
  "content-strategy": "strategy",
  "competitive-analysis": "competitors",
  "retention-analysis": "retention",
  "content-gap-analysis": "gaps",
};

export function lockedMessage(feature: Feature): string {
  const f = FEATURES[feature];
  return `${f.label} is part of the ${TIER_NAME[f.tier]} plan and above. See recktube.xyz/pricing to upgrade.`;
}
