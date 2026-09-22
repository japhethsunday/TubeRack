import type { ProjectStage } from "@/src/types/domain";
import { PROJECT_STAGES } from "@/src/types/domain";
import type {
  ActivityEvent,
  ActivityKind,
  Channel,
  Project,
  ProjectFilter,
  ProjectInput,
  ProjectSort,
  StageState,
} from "@/src/lib/projects/types";

export function freshStages(): Record<ProjectStage, StageState> {
  const stages = {} as Record<ProjectStage, StageState>;
  for (const s of PROJECT_STAGES) stages[s] = "not-started";
  stages.idea = "in-progress";
  return stages;
}

function now(at?: string): string {
  return at ?? new Date().toISOString();
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetProjectIds(): void {
  seq = 0;
}

export function createProject(input: ProjectInput, opts?: { id?: string; at?: string }): Project {
  const at = now(opts?.at);
  return {
    id: opts?.id ?? nextId("prj"),
    name: input.name.trim(),
    contentType: input.contentType,
    platform: input.platform,
    channelId: input.channelId,
    topic: input.topic.trim(),
    description: input.description.trim(),
    goal: input.goal.trim(),
    stages: freshStages(),
    currentStage: "idea",
    status: "draft",
    createdAt: at,
    updatedAt: at,
  };
}

export function renameProject(project: Project, name: string, at?: string): Project {
  const clean = name.trim();
  if (!clean) throw new Error("Project name cannot be empty.");
  return { ...project, name: clean, updatedAt: now(at) };
}

export function updateProject(project: Project, patch: Partial<ProjectInput>, at?: string): Project {
  return {
    ...project,
    ...Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    ),
    updatedAt: now(at),
  };
}

export function duplicateProject(project: Project, opts?: { id?: string; at?: string }): Project {
  const at = now(opts?.at);
  return {
    ...project,
    id: opts?.id ?? nextId("prj"),
    name: `${project.name} (copy)`,
    status: "draft",
    createdAt: at,
    updatedAt: at,
  };
}

export function archiveProject(project: Project, at?: string): Project {
  return { ...project, status: "archived", updatedAt: now(at) };
}

export function restoreProject(project: Project, at?: string): Project {
  return { ...project, status: project.currentStage === "idea" ? "draft" : "active", updatedAt: now(at) };
}

/**
 * Mark the current stage complete and advance. Single-step only, mirroring
 * the Phase 1 lifecycle guard. Completing the final stage keeps it current.
 */
export function completeCurrentStage(project: Project, at?: string): Project {
  const stages = { ...project.stages, [project.currentStage]: "complete" as StageState };
  const idx = PROJECT_STAGES.indexOf(project.currentStage);
  const next: ProjectStage =
    idx < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[idx + 1] : project.currentStage;
  if (stages[next] === "not-started") stages[next] = "in-progress";
  return {
    ...project,
    stages,
    currentStage: next,
    status: project.status === "draft" ? "active" : project.status,
    updatedAt: now(at),
  };
}

export function setStageState(
  project: Project,
  stage: ProjectStage,
  state: StageState,
  at?: string,
): Project {
  return {
    ...project,
    stages: { ...project.stages, [stage]: state },
    updatedAt: now(at),
  };
}

/** Percent of stages complete (integer 0–100). Derived only — never stored. */
export function progressOf(project: Project): number {
  const done = PROJECT_STAGES.filter((s) => project.stages[s] === "complete").length;
  return Math.round((done / PROJECT_STAGES.length) * 100);
}

const STAGE_VERBS: Record<ProjectStage, string> = {
  idea: "Refine idea",
  research: "Continue research",
  strategy: "Continue strategy",
  script: "Continue script",
  storyboard: "Continue storyboard",
  visuals: "Review visuals",
  voice: "Finish voiceover",
  music: "Finish music",
  video: "Continue editing",
  thumbnail: "Finish thumbnail",
  seo: "Finish SEO",
  repurposing: "Continue repurposing",
  publishing: "Publish",
  analytics: "Review analytics",
  improvement: "Plan improvement",
};

export function continueLabelFor(project: Project): string {
  if (project.status === "archived") return "Restore to continue";
  const done = PROJECT_STAGES.filter((s) => project.stages[s] === "complete").length;
  if (done === PROJECT_STAGES.length) return "Review project";
  return STAGE_VERBS[project.currentStage];
}

export function filterProjects(
  projects: Project[],
  query: string,
  filter: ProjectFilter,
  channelId: string,
): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (channelId !== "all" && p.channelId !== channelId) return false;
    if (filter === "active" && p.status !== "active") return false;
    if (filter === "draft" && p.status !== "draft") return false;
    if (filter === "archived" && p.status !== "archived") return false;
    if (filter === "all" && p.status === "archived") return false;
    if (!q) return true;
    return [p.name, p.topic, p.description, p.goal].some((f) => f.toLowerCase().includes(q));
  });
}

export function sortProjects(projects: Project[], sort: ProjectSort): Project[] {
  const list = [...projects];
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "progress") list.sort((a, b) => progressOf(b) - progressOf(a));
  else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return list;
}

/** Most recently updated non-archived project, if any exists. */
export function mostRecentActive(projects: Project[]): Project | null {
  const active = projects.filter((p) => p.status !== "archived");
  if (active.length === 0) return null;
  return sortProjects(active, "recent")[0];
}

export function createChannel(name: string, niche: string, opts?: { id?: string; at?: string }): Channel {
  const clean = name.trim();
  if (!clean) throw new Error("Channel name cannot be empty.");
  return { id: opts?.id ?? nextId("ch"), name: clean, niche: niche.trim(), createdAt: now(opts?.at) };
}

export function buildEvent(
  kind: ActivityKind,
  projectName: string,
  detail: string,
  opts?: { id?: string; at?: string; projectId?: string; category?: ActivityEvent["category"] },
): ActivityEvent {
  const category =
    opts?.category ?? (kind.startsWith("project.stage") ? "editing" : kind.startsWith("channel.") ? "system" : "projects");
  return {
    id: opts?.id ?? nextId("evt"),
    at: now(opts?.at),
    kind,
    category,
    projectId: opts?.projectId,
    projectName,
    detail,
  };
}
