import type { ProjectStage } from "@/src/types/domain";

/**
 * Creator-workspace domain — Phase 4.
 * Everything here is user-created, device-local state. Cloud persistence,
 * sharing, and AI-generated content arrive in later phases (backend = 11).
 */

export type StageState = "complete" | "in-progress" | "not-started";

export type ProjectStatus = "draft" | "active" | "archived";

export const CONTENT_TYPES = [
  "Long-form video",
  "Short",
  "Series episode",
  "Documentary",
  "Tutorial",
  "Vlog",
  "Essay",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const PLATFORMS = [
  "YouTube",
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook",
  "X",
  "LinkedIn",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface Channel {
  id: string;
  name: string;
  niche: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  contentType: ContentType;
  platform: Platform;
  channelId: string;
  topic: string;
  description: string;
  goal: string;
  stages: Record<ProjectStage, StageState>;
  currentStage: ProjectStage;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  contentType: ContentType;
  platform: Platform;
  channelId: string;
  topic: string;
  description: string;
  goal: string;
}

export type ActivityKind =
  | "project.created"
  | "project.renamed"
  | "project.duplicated"
  | "project.archived"
  | "project.restored"
  | "project.deleted"
  | "project.stage"
  | "channel.created";

export type ActivityCategory = "projects" | "editing" | "system";

export interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  category: ActivityCategory;
  projectId?: string;
  projectName: string;
  detail: string;
}

export type ProjectSort = "recent" | "name" | "progress";
export type ProjectFilter = "all" | "active" | "draft" | "archived";
