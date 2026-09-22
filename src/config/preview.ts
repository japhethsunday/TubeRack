import type { ProjectStage } from "@/src/types/domain";

/**
 * Explicitly static preview fixtures for the Phase 2 visual foundation.
 * Anything derived from these MUST be labeled "Preview" in the UI.
 * Real project data arrives with Phase 4 (workspace) + Phase 11 (backend).
 */

export type PreviewStageState = "complete" | "in-progress" | "not-started";

export interface PreviewStageProgress {
  stage: ProjectStage;
  label: string;
  state: PreviewStageState;
}

export const PREVIEW_PROJECT = {
  id: "preview",
  title: "Sample episode — design preview",
  workspace: "Preview workspace",
  currentStage: "storyboard" as ProjectStage,
  updatedAt: "Preview data — not saved",
} as const;

export const PREVIEW_PROGRESS: PreviewStageProgress[] = [
  { stage: "idea", label: "Idea", state: "complete" },
  { stage: "research", label: "Research", state: "complete" },
  { stage: "strategy", label: "Strategy", state: "complete" },
  { stage: "script", label: "Script", state: "complete" },
  { stage: "storyboard", label: "Storyboard", state: "in-progress" },
  { stage: "visuals", label: "Visuals", state: "not-started" },
  { stage: "voice", label: "Voice", state: "not-started" },
  { stage: "music", label: "Music", state: "not-started" },
  { stage: "video", label: "Video", state: "not-started" },
  { stage: "thumbnail", label: "Thumbnail", state: "not-started" },
  { stage: "seo", label: "SEO", state: "not-started" },
  { stage: "repurposing", label: "Repurposing", state: "not-started" },
  { stage: "publishing", label: "Publishing", state: "not-started" },
  { stage: "analytics", label: "Analytics", state: "not-started" },
  { stage: "improvement", label: "Improvement", state: "not-started" },
];
