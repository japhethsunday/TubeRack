import type { ProjectStage } from "@/src/types/domain";
import { PROJECT_STAGES } from "@/src/types/domain";

/**
 * Project lifecycle order. Output of each stage becomes structured
 * input to the next — stages are never treated as isolated tools.
 */
export function stageIndex(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage);
}

export function nextStage(stage: ProjectStage): ProjectStage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[i + 1] : null;
}

export function previousStage(stage: ProjectStage): ProjectStage | null {
  const i = stageIndex(stage);
  return i > 0 ? PROJECT_STAGES[i - 1] : null;
}

/** Guard advancement: only allow moving to the adjacent next stage. */
export function assertCanAdvance(from: ProjectStage, to: ProjectStage): void {
  if (nextStage(from) !== to) {
    throw new Error(`Projects advance one stage at a time: ${from} -> ${to} is not allowed`);
  }
}

export function allStages(): readonly ProjectStage[] {
  return PROJECT_STAGES;
}
