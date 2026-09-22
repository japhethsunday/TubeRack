import type { UsageKind } from "@/src/types/domain";

/**
 * Intelligence task registry — Phase 5.
 * Defines WHAT the product can ask for (task contract + usage kind) without
 * coupling to any vendor. Provider execution arrives in Phase 11; until then
 * the UI runs deterministic local analyzers labeled as such.
 */

export const INTELLIGENCE_TASKS = [
  "idea-analysis",
  "topic-discovery",
  "audience-analysis",
  "content-strategy",
  "competitive-analysis",
  "title-analysis",
  "hook-analysis",
  "retention-analysis",
  "content-gap-analysis",
  "brief-generation",
] as const;

export type IntelligenceTaskType = (typeof INTELLIGENCE_TASKS)[number];

export interface IntelligenceTaskDef {
  type: IntelligenceTaskType;
  label: string;
  blurb: string;
  usageKind: UsageKind;
  route: string;
}

export const INTELLIGENCE_TASK_DEFS: Record<IntelligenceTaskType, IntelligenceTaskDef> = {
  "idea-analysis": {
    type: "idea-analysis",
    label: "Idea analysis",
    blurb: "Strengths, risks, opportunities, and recommendations for a raw idea.",
    usageKind: "text",
    route: "/intelligence/lab",
  },
  "topic-discovery": {
    type: "topic-discovery",
    label: "Topic discovery",
    blurb: "Differentiated angles from a raw idea, question, or keyword.",
    usageKind: "text",
    route: "/intelligence/lab",
  },
  "audience-analysis": {
    type: "audience-analysis",
    label: "Audience analysis",
    blurb: "Structured audience profile: problem, desire, intent, objections.",
    usageKind: "text",
    route: "/intelligence/audience",
  },
  "content-strategy": {
    type: "content-strategy",
    label: "Content strategy",
    blurb: "Angle, promise, narrative, format, and differentiation as data.",
    usageKind: "text",
    route: "/intelligence/strategy",
  },
  "competitive-analysis": {
    type: "competitive-analysis",
    label: "Competitive analysis",
    blurb: "User-entered references compared on angle, depth, and gaps.",
    usageKind: "research",
    route: "/intelligence/gaps",
  },
  "title-analysis": {
    type: "title-analysis",
    label: "Title analysis",
    blurb: "Clarity, curiosity, specificity, and misleading-language checks.",
    usageKind: "text",
    route: "/intelligence/titles",
  },
  "hook-analysis": {
    type: "hook-analysis",
    label: "Hook analysis",
    blurb: "Weak-opening detection plus hook-type frameworks.",
    usageKind: "text",
    route: "/intelligence/hooks",
  },
  "retention-analysis": {
    type: "retention-analysis",
    label: "Retention analysis",
    blurb: "Structural risks in a planned outline: pacing, repetition, payoff.",
    usageKind: "text",
    route: "/intelligence/retention",
  },
  "content-gap-analysis": {
    type: "content-gap-analysis",
    label: "Content-gap analysis",
    blurb: "Local catalog vs. topic vs. entered references — gaps only, no invented data.",
    usageKind: "research",
    route: "/intelligence/gaps",
  },
  "brief-generation": {
    type: "brief-generation",
    label: "Brief generation",
    blurb: "Assembles idea, audience, strategy, and DNA into a production brief.",
    usageKind: "text",
    route: "/intelligence/strategy",
  },
};

export type GenerationStatus =
  | "idle"
  | "preparing"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

const GENERATION_TRANSITIONS: Record<GenerationStatus, readonly GenerationStatus[]> = {
  idle: ["preparing", "generating"],
  preparing: ["generating", "cancelled", "failed"],
  generating: ["completed", "failed", "cancelled"],
  completed: ["preparing", "generating", "idle"],
  failed: ["preparing", "generating", "idle"],
  cancelled: ["idle", "preparing", "generating"],
};

export function canGenerateTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  return GENERATION_TRANSITIONS[from].includes(to);
}

export function assertGenerateTransition(from: GenerationStatus, to: GenerationStatus): void {
  if (!canGenerateTransition(from, to)) {
    throw new Error(`Illegal generation transition: ${from} -> ${to}`);
  }
}

export function isActiveGeneration(status: GenerationStatus): boolean {
  return status === "preparing" || status === "generating";
}
