import type { JobStatus } from "@/src/types/domain";
import { JOB_STATUSES } from "@/src/types/domain";

/**
 * Pure job state machine. Every long-running operation
 * (render, generation, transcription) moves through these states
 * so each stage is independently recoverable and retryable.
 */

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed", "cancelled"],
  retrying: ["processing", "cancelled", "failed"],
  failed: ["retrying", "cancelled", "queued"],
  cancelled: ["queued"],
  completed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition: ${from} -> ${to}`);
  }
}

export function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function allStatuses(): readonly JobStatus[] {
  return JOB_STATUSES;
}
