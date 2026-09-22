import { z } from "zod";
import { PROJECT_STAGES, type ProjectStage } from "@/src/types/domain";
import type { ActivityEvent, Channel, Project } from "@/src/lib/projects/types";
import { CONTENT_TYPES, PLATFORMS } from "@/src/lib/projects/types";

const stageState = z.enum(["complete", "in-progress", "not-started"]);

const stagesSchema = z.record(z.enum(PROJECT_STAGES as unknown as [string, ...string[]]), stageState);

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.enum(CONTENT_TYPES),
  platform: z.enum(PLATFORMS),
  channelId: z.string(),
  topic: z.string(),
  description: z.string(),
  goal: z.string(),
  stages: stagesSchema,
  currentStage: z.enum(PROJECT_STAGES as unknown as [string, ...string[]]),
  status: z.enum(["draft", "active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  niche: z.string(),
  createdAt: z.string(),
});

const eventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum([
    "project.created",
    "project.renamed",
    "project.duplicated",
    "project.archived",
    "project.restored",
    "project.deleted",
    "project.stage",
    "channel.created",
  ]),
  category: z.enum(["projects", "editing", "system"]),
  projectId: z.string().optional(),
  projectName: z.string(),
  detail: z.string(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
  channels: z.array(channelSchema),
  events: z.array(eventSchema),
});

export interface WorkspaceBundle {
  version: 1;
  projects: Project[];
  channels: Channel[];
  events: ActivityEvent[];
}

export const WORKSPACE_STORAGE_KEY = "tuberack.workspace.v1";
export const RECENT_SEARCHES_KEY = "tuberack.recent-searches.v1";

/** Validate an imported bundle; throws with a readable message on mismatch. */
export function parseBundle(data: unknown): WorkspaceBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack workspace file: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "root"} — ${i.message}`)
        .join("; ")}`,
    );
  }
  return {
    version: 1,
    projects: parsed.data.projects as Project[],
    channels: parsed.data.channels,
    events: parsed.data.events,
  };
}

export function emptyBundle(): WorkspaceBundle {
  return { version: 1, projects: [], channels: [], events: [] };
}

/** Stage labels for UI (single source; mirrors domain order). */
export function stageLabel(stage: ProjectStage): string {
  return stage[0].toUpperCase() + stage.slice(1);
}
