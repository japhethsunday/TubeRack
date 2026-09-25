"use client";

import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { productionContext, type ProductionContext } from "@/src/lib/projects/production-context";

/** The shared production brief for a project (null until the project loads). */
export function useProductionContext(projectId: string | null | undefined): ProductionContext | null {
  const { projects } = useProjects();
  const intel = useIntel();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;
  return productionContext({ project, dna: intel.dnaFor(project.channelId), intel: intel.intelFor(project.id) });
}
