"use client";

import { ProjectsProvider } from "@/src/components/projects/ProjectsProvider";

/** Client state for the authenticated app group (device-local until Phase 11). */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  return <ProjectsProvider>{children}</ProjectsProvider>;
}
