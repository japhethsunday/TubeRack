/**
 * TubeRack core domain types — Phase 1 foundation.
 *
 * These are structural contracts only. Persistence, auth, billing,
 * and provider integrations land in later phases (backend = Phase 11).
 * Nothing here performs I/O or fabricates data.
 */

/** Full content lifecycle, in order. One connected workflow, not isolated tools. */
export const PROJECT_STAGES = [
  "idea",
  "research",
  "strategy",
  "script",
  "storyboard",
  "voice",
  "visuals",
  "music",
  "video",
  "thumbnail",
  "seo",
  "repurposing",
  "publishing",
  "analytics",
  "improvement",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** Recoverable job lifecycle for all long-running work (render, generation, etc.). */
export const JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "retrying",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Expensive operations that must be measured through the credit ledger. */
export const USAGE_KINDS = [
  "text",
  "image",
  "video",
  "voice",
  "music",
  "render",
  "transcription",
  "research",
] as const;

export type UsageKind = (typeof USAGE_KINDS)[number];

/** AI capability families behind the provider-independent gateway. */
export const AI_CAPABILITIES = [
  "text",
  "image",
  "video",
  "tts",
  "music",
  "embedding",
  "research",
  "transcription",
] as const;

export type AICapability = (typeof AI_CAPABILITIES)[number];

export interface CreditTransaction {
  id: string;
  accountId: string;
  kind: UsageKind;
  amount: number; // negative = debit, positive = grant/refund
  balanceAfter: number;
  ref?: string;
  createdAt: string; // ISO timestamp
}

/** Unified project context: output of each stage is structured input to the next. */
export interface ProjectContext {
  id: string;
  topic: string;
  audience?: string;
  niche?: string;
  angle?: string;
  stage: ProjectStage;
  updatedAt: string;
}
