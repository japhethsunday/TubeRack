"use client";

import { ProjectsProvider } from "@/src/components/projects/ProjectsProvider";
import { IntelProvider } from "@/src/components/intelligence/IntelProvider";
import { ScriptProvider } from "@/src/components/script/ScriptProvider";
import { MediaProvider } from "@/src/components/media/MediaProvider";
import { VideoProvider } from "@/src/components/video/VideoProvider";
import { PackagingProvider } from "@/src/components/package/PackagingProvider";
import { AnalyticsProvider } from "@/src/components/analytics/AnalyticsProvider";
import { BackendStatusProvider } from "@/src/components/shell/BackendStatus";

/** Client state for the authenticated app group (cloud sync with device-local fallback). */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  return (
    <BackendStatusProvider>
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
    </BackendStatusProvider>
  );
}
