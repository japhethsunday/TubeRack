"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { MediaStorageNote } from "@/src/components/media/MediaProvider";
import { LibraryView } from "@/src/components/media/library";
import { SceneNeeds } from "@/src/components/media/needs";
import { ImageStudio } from "@/src/components/media/image-studio";
import { VoiceStudio } from "@/src/components/media/voice-studio";
import { MusicStudio, SfxStudio } from "@/src/components/media/music-studio";
import { UploadZone } from "@/src/components/media/uploads";
import { ConsistencyPanel } from "@/src/components/media/style";
import { QueueView } from "@/src/components/media/queue";
import { Breadcrumb } from "@/src/components/ui/data";
import { Tabs } from "@/src/components/ui/Tabs";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { useMedia } from "@/src/components/media/MediaProvider";

const TAB_IDS = ["library", "scenes", "image", "voice", "audio", "uploads", "style", "queue"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(v: string | null): v is TabId {
  return (TAB_IDS as readonly string[]).includes(v ?? "");
}

export default function MediaStudioPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Visual & Audio Studio" />}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const params = useSearchParams();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const { ready: intelReady, dnaFor } = useIntel();
  const { ready: scriptsReady, scriptFor, scenesFor } = useScripts();
  const { ready: mediaReady } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("project"));
  const urlProject = params.get("project");
  const [syncedProject, setSyncedProject] = useState(urlProject);
  if (urlProject !== syncedProject) {
    setSyncedProject(urlProject);
    setSelectedId(urlProject);
  }
  const router = useRouter();
  const urlTab: TabId = isTabId(params.get("tab")) ? (params.get("tab") as TabId) : "library";
  const [tab, setTabState] = useState<TabId>(urlTab);
  // Follow the URL: sidebar links like ?tab=voice → ?tab=audio stay on this page.
  const [syncedUrlTab, setSyncedUrlTab] = useState(urlTab);
  if (urlTab !== syncedUrlTab) {
    setSyncedUrlTab(urlTab);
    setTabState(urlTab);
  }
  function setTab(next: TabId) {
    setTabState(next);
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`?${q.toString()}`, { scroll: false });
  }
  const [jumpScene, setJumpScene] = useState<string>("");
  const reruns = useRef(new Map<string, () => void>());
  const ready = projectsReady && intelReady && scriptsReady && mediaReady;

  const project = projects.find((p) => p.id === selectedId);
  const script = project ? scriptFor(project.id) : null;
  const scenes = project ? scenesFor(project.id) : [];
  const dna = project ? dnaFor(project.channelId) : null;

  function registerRerun(assetId: string, fn: () => void) {
    reruns.current.set(assetId, fn);
  }

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading Visual & Audio Studio" />
      </div>
    );
  }

  if (!project) {
    const active = projects.filter((p) => p.status !== "archived");
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Media Studio" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Visual &amp; Audio Studio</h1>
          <p className="mt-1 text-sm text-muted-text">Select a project — assets stay attached to it and its scenes.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="Media belongs to projects. Create one first."
            action={
              <Link href="/projects" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                Go to projects
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Choose a project">
            {active.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-muted-text/50"
                >
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

  const sceneOptions = scenes.map((s) => ({ id: s.id, title: `${s.number}. ${s.title}` }));
  const sceneRefs = scenes.map((s) => ({
    id: s.id,
    title: s.title,
    number: s.number,
    scriptText: s.scriptText,
    visual: s.visual,
  }));
  const voiceSources = [
    ...(script?.sections.map((s) => ({ id: `sec-${s.id}`, label: `Script: ${s.heading}`, text: s.text })) ?? []),
    ...scenes.map((s) => ({ id: `scn-${s.id}`, label: `Scene ${s.number}: ${s.title}`, text: s.narration || s.scriptText })),
  ];

  function jump(toTab: string, sceneId: string) {
    setJumpScene(sceneId);
    if (isTabId(toTab)) setTab(toTab);
  }

  const tabs = [
    {
      id: "library",
      label: "Library",
      content: <LibraryView projectId={project.id} sceneOptions={sceneOptions} />,
    },
    {
      id: "scenes",
      label: "Scene needs",
      content: (
        <SceneNeeds
          projectId={project.id}
          scenes={scenes.map((s) => ({
            id: s.id,
            number: s.number,
            title: s.title,
            scriptText: s.scriptText,
            visual: s.visual,
            durationSec: s.durationSec,
            assetsNeeded: s.assetsNeeded,
            narration: s.narration,
          }))}
          onJump={jump}
        />
      ),
    },
    {
      id: "image",
      label: "Image",
      content: (
        <ImageStudio
          key={`img-${jumpScene}`}
          projectId={project.id}
          scenes={sceneRefs}
          initialSceneId={jumpScene || undefined}
          dnaTone={dna?.tone ?? ""}
          dnaPositioning={dna?.positioning ?? ""}
          dnaAvoid={dna?.avoidWords ?? ""}
          visualStyle=""
          colorDirection=""
          platform={project.platform}
          registerRerun={registerRerun}
        />
      ),
    },
    {
      id: "voice",
      label: "Voice",
      content: <VoiceStudio key={`vox-${jumpScene}`} projectId={project.id} sources={voiceSources} registerRerun={registerRerun} initialSourceId={jumpScene ? `scn-${jumpScene}` : undefined} />,
    },
    {
      id: "audio",
      label: "Music & SFX",
      content: (
        <div className="space-y-8">
          <section aria-label="Music studio">
            <h2 className="mb-3 text-sm font-semibold">Music</h2>
            <MusicStudio projectId={project.id} registerRerun={registerRerun} />
          </section>
          <section aria-label="Sound effects studio">
            <h2 className="mb-3 text-sm font-semibold">Sound effects</h2>
            <SfxStudio projectId={project.id} registerRerun={registerRerun} />
          </section>
        </div>
      ),
    },
    {
      id: "uploads",
      label: "Uploads",
      content: <UploadZone projectId={project.id} />,
    },
    {
      id: "style",
      label: "Style",
      content: <ConsistencyPanel projectId={project.id} channelId={project.channelId} />,
    },
    {
      id: "queue",
      label: "Queue",
      content: (
        <QueueView
          projectId={project.id}
          onRetry={(id) => reruns.current.get(id)?.()}
          hasRerun={(id) => reruns.current.has(id)}
        />
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }, { label: "Media Studio" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Visual &amp; Audio Studio — {project.name}</h1>
          <p className="mt-0.5 text-xs text-muted-text">
            {channelName(project.channelId)} · {scenes.length} scene(s) · on-device drafts are free; generated images and voice need sign-in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Switch project
        </button>
      </div>
      <Tabs defaultId={tab} urlParam="tab" tabs={tabs} onChange={(id) => isTabId(id) && setTab(id as TabId)} />
      <div className="flex flex-col gap-2">
        <LocalStorageNote />
        <MediaStorageNote />
      </div>
    </div>
  );
}
