"use client";

import { ProjectsProvider } from "@/src/components/projects/ProjectsProvider";
import { IntelProvider } from "@/src/components/intelligence/IntelProvider";

/** Client state for the authenticated app group (device-local until Phase 11). */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <IntelProvider>{children}</IntelProvider>
    </ProjectsProvider>
  );
}
