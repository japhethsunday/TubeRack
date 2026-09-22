import type { ProjectStage } from "@/src/types/domain";
import type { IntelligenceTaskType } from "@/src/lib/intelligence/tasks";

/**
 * Future provider path: AI Gateway → Text Model → Intelligence Task.
 * No provider is configured before Phase 11, so every call throws the
 * explicit boundary error. The UI runs deterministic local analyzers
 * instead and labels them "Local analysis" — never provider output.
 */
export class IntelligenceNotConfiguredError extends Error {
  readonly code = "INTELLIGENCE_NOT_CONFIGURED";
  readonly task: IntelligenceTaskType;

  constructor(task: IntelligenceTaskType) {
    super(
      `Intelligence task "${task}" needs a configured text provider (Phase 11 integration boundary). Nothing was generated.`,
    );
    this.name = "IntelligenceNotConfiguredError";
    this.task = task;
  }
}

export interface IntelligenceRequest {
  task: IntelligenceTaskType;
  context: Record<string, unknown>;
}

export async function requestIntelligence(request: IntelligenceRequest): Promise<never> {
  throw new IntelligenceNotConfiguredError(request.task);
}

/** Resolved model info for Phase 11 usage records. Until then, unset. */
export function currentModelInfo(): { provider: string; model: string } | null {
  return null;
}

/** Research source contract (Phase 6 expands collection; this is the shape). */
export interface ResearchSource {
  id: string;
  title: string;
  url?: string;
  summary: string;
  facts: string[];
  publishedAt?: string;
  credibility?: "high" | "medium" | "low" | "unknown";
  notes?: string;
}

/** Platform snapshot contract (Phase 11 ingestion; never fabricated). */
export interface PlatformSnapshot {
  kind: "video" | "channel";
  externalId: string;
  title: string;
  fetchedAt: string;
  metrics?: Record<string, number>;
  metricsProvenance?: string;
}

export type { ProjectStage };
