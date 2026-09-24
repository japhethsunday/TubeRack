import { PROJECT_STAGES, type ProjectStage } from "@/src/types/domain";

/** Every pipeline stage opens the real tool for a project. */
export function stageHref(stage: ProjectStage, projectId: string): string {
  const q = `project=${encodeURIComponent(projectId)}`;
  const map: Record<ProjectStage, string> = {
    idea: `/intelligence/lab?${q}`,
    research: `/intelligence/research?${q}`,
    strategy: `/intelligence/strategy?${q}`,
    script: `/studio/script?${q}`,
    storyboard: `/studio/storyboard?${q}`,
    visuals: `/studio/media?${q}&tab=image`,
    voice: `/studio/media?${q}&tab=voice`,
    music: `/studio/media?${q}&tab=audio`,
    video: `/studio/video?${q}`,
    thumbnail: `/studio/package?${q}&tab=thumbnail`,
    seo: `/studio/package?${q}&tab=seo`,
    repurposing: `/studio/package?${q}&tab=repurpose`,
    publishing: `/studio/package?${q}&tab=platforms`,
    analytics: `/analytics?${q}`,
    improvement: `/analytics?${q}`,
  };
  return map[stage];
}

/** The stage a page represents (path + optional ?tab=), or null. */
export function stageAt(pathname: string, tab: string | null): ProjectStage | null {
  const matches = PROJECT_STAGES.filter((s) => {
    const [path, query] = stageHref(s, "x").split("?");
    if (path !== pathname) return false;
    const want = new URLSearchParams(query).get("tab");
    return !want || !tab || want === tab;
  });
  if (matches.length === 0) return null;
  // Tabbed pages: exact tab wins; no tab → the page's first stage.
  return (tab && matches.find((s) => new URLSearchParams(stageHref(s, "x").split("?")[1]).get("tab") === tab)) || matches[0];
}

/** Next stage in the pipeline (skips stages that open the same page+tab). */
export function nextStage(stage: ProjectStage): ProjectStage | null {
  const i = PROJECT_STAGES.indexOf(stage);
  const here = stageHref(stage, "x");
  for (let j = i + 1; j < PROJECT_STAGES.length; j++) {
    if (stageHref(PROJECT_STAGES[j], "x") !== here) return PROJECT_STAGES[j];
  }
  return null;
}
