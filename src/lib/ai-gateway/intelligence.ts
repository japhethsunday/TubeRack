import type { ProjectStage } from "@/src/types/domain";
import type { IntelligenceTaskType } from "@/src/lib/intelligence/tasks";
import { currentGeminiModel, runIntelligenceTask } from "@/src/server/ai/gemini";

/**
 * AI Gateway → Gemini → Intelligence Task.
 * Without GEMINI_API_KEY every call throws the explicit boundary error and
 * the UI runs deterministic local analyzers instead, labeled
 * "Local analysis" — never provider output.
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

export interface IntelligenceResponse {
  task: string;
  text: string;
  model: string;
}

/** Routes through Gemini when configured; otherwise the boundary error. */
export async function requestIntelligence(request: IntelligenceRequest): Promise<IntelligenceResponse> {
  return runIntelligenceTask(request);
}

/** Resolved model info for Phase 11 usage records. Null until configured. */
export function currentModelInfo(): { provider: string; model: string } | null {
  return currentGeminiModel();
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
  /** True when the primary API was unavailable and a fallback source served. */
  degraded?: boolean;
}

export type { ProjectStage };
