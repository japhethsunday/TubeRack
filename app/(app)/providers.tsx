"use client";

import { ProjectsProvider } from "@/src/components/projects/ProjectsProvider";
import { IntelProvider } from "@/src/components/intelligence/IntelProvider";
import { ScriptProvider } from "@/src/components/script/ScriptProvider";
import { MediaProvider } from "@/src/components/media/MediaProvider";

/** Client state for the authenticated app group (device-local until Phase 11). */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <IntelProvider>
        <ScriptProvider>
          <MediaProvider>{children}</MediaProvider>
        </ScriptProvider>
      </IntelProvider>
    </ProjectsProvider>
  );
}
