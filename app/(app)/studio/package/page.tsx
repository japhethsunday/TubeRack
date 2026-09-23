"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo } from "@/src/components/video/VideoProvider";
import { usePackaging, PackageStorageNote } from "@/src/components/package/PackagingProvider";
import { ThumbnailTab } from "@/src/components/package/thumbnail-tab";
import { TitlesTab } from "@/src/components/package/titles-tab";
import { SeoWorkspace } from "@/src/components/package/seo";
import { PlatformsPanel } from "@/src/components/package/platforms";
import { RepurposeWorkspace } from "@/src/components/package/repurpose";
import { PackageOverview } from "@/src/components/package/overview";
import { sceneSegments, durationOf } from "@/src/lib/video/build";
import { detectClaims } from "@/src/lib/script/claims";
import { Breadcrumb } from "@/src/components/ui/data";
import { Tabs } from "@/src/components/ui/Tabs";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";

const TAB_IDS = ["overview", "thumbnail", "titles", "seo", "platforms", "repurpose"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(v: string | null): v is TabId {
  return (TAB_IDS as readonly string[]).includes(v ?? "");
}

export default function PackageStudioPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Packaging Studio" />}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const params = useSearchParams();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const { ready: intelReady, intelFor, dnaFor } = useIntel();
  const { ready: scriptsReady, scriptFor, scenesFor } = useScripts();
  const { ready: mediaReady, assetsFor } = useMedia();
  const { ready: videoReady, compFor } = useVideo();
  const packaging = usePackaging();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("project"));
  const [tab, setTab] = useState<TabId>(isTabId(params.get("tab")) ? (params.get("tab") as TabId) : "overview");

  const ready = projectsReady && intelReady && scriptsReady && mediaReady && videoReady && packaging.ready;
  const project = projects.find((p) => p.id === selectedId);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading Packaging Studio" />
      </div>
    );
  }

  if (!project) {
    const active = projects.filter((p) => p.status !== "archived");
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Packaging" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Thumbnail, SEO &amp; Repurposing</h1>
          <p className="mt-1 text-sm text-muted-text">Select a project — packaging stays attached to it.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState title="No projects yet" body="Packaging belongs to projects. Create one first." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Choose a project">
            {active.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setSelectedId(p.id)} className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-muted-text/50">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-text">{channelName(p.channelId)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const pid = project.id;
  const intel = intelFor(pid);
  const dna = dnaFor(project.channelId);
  const script = scriptFor(pid);
  const scenes = scenesFor(pid);
  const comp = compFor(pid);
  const assets = assetsFor(pid);
  const sections = script?.sections ?? [];
  const scriptText = sections.map((s) => s.text).join("\n\n");
  const segments = sceneSegments(scenes);
  const duration = Math.max(durationOf(comp.clips), segments.reduce((n, s) => n + s.durationSec, 0), 0);

  const primaryTitle = packaging.primaryTitleFor(pid)?.text
    || intel.titles.find((t) => t.status === "approved")?.text
    || "";
  const audienceText = intel.audience?.primary || "";
  const strategy = intel.strategy;
  const seo = packaging.seoFor(pid);
  const claims = sections.flatMap((s) => detectClaims(s.text).map((c) => ({ text: c.text, kind: c.kind })));
  const approvedHooks = intel.hooks.filter((h) => h.status === "approved").map((h) => ({ id: h.id, text: h.text }));
  const imageDrafts = assets.filter((a) => a.kind === "image");

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <PackageOverview
          projectId={pid}
          input={{
            projectName: project.name,
            primaryTitle,
            durationSec: duration,
            clipCount: comp.clips.length,
            sourceText: scriptText,
            avoidWords: dna.avoidWords.split(","),
          }}
          exportPayload={() => ({
            project: { id: pid, name: project.name, topic: project.topic, platform: project.platform },
            title: primaryTitle,
            thumbnail: packaging.approvedVariantFor(pid),
            seo: packaging.seoFor(pid),
            platforms: (["youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"] as const).map((platform) => packaging.packFor(pid, platform)),
            repurposed: packaging.itemsFor(pid),
            video: { durationSec: duration, clips: comp.clips.length },
            exportedAt: new Date().toISOString(),
          })}
        />
      ),
    },
    {
      id: "thumbnail",
      label: "Thumbnail",
      content: (
        <ThumbnailTab
          projectId={pid}
          context={{
            topic: project.topic,
            title: primaryTitle || project.topic,
            audience: audienceText,
            angle: strategy?.angle ?? "",
            tone: dna.tone,
            visualStyle: "",
            avoidStyles: dna.avoidWords,
            brandColor: "#ffffff",
          }}
          primaryTitle={primaryTitle}
          imageDrafts={imageDrafts}
        />
      ),
    },
    {
      id: "titles",
      label: "Titles",
      content: <TitlesTab projectId={pid} topic={project.topic} audience={audienceText || "creators"} promise={strategy?.promise ?? ""} scriptText={scriptText} />,
    },
    {
      id: "seo",
      label: "SEO",
      content: (
        <SeoWorkspace
          projectId={pid}
          context={{
            promise: strategy?.promise ?? "",
            topic: project.topic,
            takeaway: strategy?.takeaway ?? "",
            cta: strategy?.cta ?? "",
            audience: audienceText,
            scriptText,
            segments: segments.map((s) => ({ title: s.title, startSec: s.startSec })),
            durationSec: duration,
            primaryTitle,
          }}
        />
      ),
    },
    {
      id: "platforms",
      label: "Platforms",
      content: (
        <PlatformsPanel
          projectId={pid}
          defaults={{ title: primaryTitle, description: seo.description, hashtags: seo.hashtags }}
        />
      ),
    },
    {
      id: "repurpose",
      label: "Repurpose",
      content: (
        <RepurposeWorkspace
          projectId={pid}
          context={{
            hooks: approvedHooks.length > 0 ? approvedHooks : intel.hooks.slice(0, 3).map((h) => ({ id: h.id, text: h.text })),
            sections: sections.map((s) => ({ id: s.id, type: s.type, heading: s.heading, text: s.text })),
            claims,
            hashtags: seo.hashtags,
            cta: strategy?.cta ?? "",
            avoidWords: dna.avoidWords.split(","),
            sourceLabel: project.name,
          }}
        />
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${pid}` }, { label: "Packaging" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Packaging — {project.name}</h1>
          <p className="mt-0.5 text-xs text-muted-text">
            {channelName(project.channelId)} · thumbnail + titles + SEO + platforms + derivatives. Approval never publishes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Switch project
          </button>
          <Link href={`/studio/video?project=${pid}`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
            Video Studio
          </Link>
        </div>
      </div>
      <Tabs defaultId={tab} tabs={tabs} />
      <div className="flex flex-col gap-2">
        <LocalStorageNote />
        <PackageStorageNote />
      </div>
    </div>
  );
}
