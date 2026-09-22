"use client";

import { ProjectsProvider } from "@/src/components/projects/ProjectsProvider";
import { IntelProvider } from "@/src/components/intelligence/IntelProvider";
import { ScriptProvider } from "@/src/components/script/ScriptProvider";
import { MediaProvider } from "@/src/components/media/MediaProvider";
import { VideoProvider } from "@/src/components/video/VideoProvider";
import { PackagingProvider } from "@/src/components/package/PackagingProvider";
import { AnalyticsProvider } from "@/src/components/analytics/AnalyticsProvider";

/** Client state for the authenticated app group (device-local until Phase 11). */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <IntelProvider>
        <ScriptProvider>
          <MediaProvider>
            <VideoProvider>
              <PackagingProvider>
                <AnalyticsProvider>{children}</AnalyticsProvider>
              </PackagingProvider>
            </VideoProvider>
          </MediaProvider>
        </ScriptProvider>
      </IntelProvider>
    </ProjectsProvider>
  );
}
