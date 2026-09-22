"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Undo2, Redo2, Wand2, Camera } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo, VideoStorageNote } from "@/src/components/video/VideoProvider";
import { useIntelQuery } from "@/src/components/intelligence/chrome";
import { Timeline } from "@/src/components/video/Timeline";
import { Preview } from "@/src/components/video/Preview";
import { ScenesPanel, MediaPanel, TextPanel, Inspector, ExportPanel } from "@/src/components/video/panels";
import { Breadcrumb } from "@/src/components/ui/data";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { Tabs } from "@/src/components/ui/Tabs";
import { Modal } from "@/src/components/ui/overlays";
import { Input } from "@/src/components/ui/fields";
import { sceneSegments, buildFromScenes, captionsFromNarration, durationOf, validateComposition, healthOf } from "@/src/lib/video/build";
import { moveClip, trimClip, splitClipAt, deleteClip, duplicateClip, addClip, snapTime, snapCandidates } from "@/src/lib/video/ops";
import { presetById, textPresetById, brandedTitleStyle } from "@/src/lib/video/presets";
import type { MediaAsset } from "@/src/lib/media/types";
import type { TimelineClip } from "@/src/lib/video/types";
import { cx } from "@/src/components/ui/cx";

export default function VideoStudioPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Video Studio" />}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const { projectId } = useIntelQuery();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const { ready: intelReady, dnaFor } = useIntel();
  const scriptsApi = useScripts();
  const mediaApi = useMedia();
  const video = useVideo();

  const [selectedId, setSelectedId] = useState<string | null>(projectId);
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(44);
  const [snap, setSnap] = useState(true);
  const [leftTab, setLeftTab] = useState("scenes");
  const [rightTab, setRightTab] = useState("inspector");
  const [presetId, setPresetId] = useState("youtube");
  const [quality, setQuality] = useState("Standard");
  const [fps, setFps] = useState("30");
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");

  const ready = projectsReady && intelReady && scriptsApi.ready && mediaApi.ready && video.ready;
  const project = projects.find((p) => p.id === selectedId);
  const comp = project ? video.compFor(project.id) : null;
  const scenes = useMemo(() => (project ? scriptsApi.scenesFor(project.id) : []), [project, scriptsApi]);
  const assets = useMemo(() => (project ? mediaApi.assetsFor(project.id) : []), [project, mediaApi]);
  const dna = project ? dnaFor(project.channelId) : null;

  const segments = useMemo(() => sceneSegments(scenes), [scenes]);
  const duration = useMemo(
    () => Math.max(durationOf(comp?.clips ?? []), segments.reduce((n, s) => n + s.durationSec, 0), 5),
    [comp, segments],
  );
  const issues = useMemo(
    () => (comp && project ? validateComposition(comp, scenes, assets) : []),
    [comp, project, scenes, assets],
  );
  const health = healthOf(issues);
  const selectedClip = comp?.clips.find((c) => c.id === selectedClipId) ?? null;

  // Page-level undo/redo shortcuts (skipped while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && project) {
        e.preventDefault();
        if (e.shiftKey) video.redo(project.id);
        else video.undo(project.id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && project) {
        e.preventDefault();
        video.redo(project.id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <LoadingState label="Loading Video Studio" />
      </div>
    );
  }

  if (!project || !comp) {
    const active = projects.filter((p) => p.status !== "archived");
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Video Studio" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Video Production Studio</h1>
          <p className="mt-1 text-sm text-muted-text">Select a project — scenes and approved assets compose the timeline.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState title="No projects yet" body="Compositions live inside projects." />
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
  const composition = comp;
  const clips = composition.clips;
  const tracks = composition.tracks;
  const canvas = composition.canvas;

  function commit(next: TimelineClip[]) {
    video.commitClips(pid, clips, next);
  }

  function autoBuild() {
    const built = buildFromScenes(scenes, assets);
    if (clips.length === 0) {
      video.setClips(pid, built);
    } else {
      video.saveSnapshot(pid, "Pre-build backup");
      video.setClips(pid, built);
    }
    setConfirmBuild(false);
    setPlayhead(0);
  }

  function addAssetAtPlayhead(asset: MediaAsset) {
    const trackId = `track_${asset.kind}`;
    const seg = segments.find((s) => playhead >= s.startSec && playhead < s.startSec + s.durationSec);
    const durationSec =
      asset.kind === "image" ? 3 : asset.durationSec && asset.durationSec > 0 ? Math.min(asset.durationSec, 30) : 5;
    commit(addClip(clips, {
      trackId,
      sceneId: seg?.sceneId,
      kind: asset.kind,
      name: asset.title,
      assetId: asset.id,
      startSec: playhead,
      durationSec,
      volume: asset.kind === "music" ? 0.35 : 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      motion: asset.kind === "image" ? "kenburns" : undefined,
    }));
  }

  function onDropAsset(e: React.DragEvent) {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("application/x-tuberack-asset");
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    const candidates = snapCandidates(clips, "", t, segments.map((s) => s.startSec));
    const seg = segments.find((s) => t >= s.startSec && t < s.startSec + s.durationSec);
    commit(addClip(clips, {
      trackId: `track_${asset.kind}`,
      sceneId: seg?.sceneId,
      kind: asset.kind,
      name: asset.title,
      assetId: asset.id,
      startSec: snapTime(t, candidates, snap),
      durationSec: asset.kind === "image" ? 3 : asset.durationSec && asset.durationSec > 0 ? Math.min(asset.durationSec, 30) : 5,
      volume: asset.kind === "music" ? 0.35 : 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      motion: asset.kind === "image" ? "kenburns" : undefined,
    }));
  }

  function addText(presetId: string | null, text: string) {
    const preset = presetId ? textPresetById(presetId) : null;
    const style = preset && preset.id === "title"
      ? brandedTitleStyle(dna?.positioning ?? "", undefined)
      : (preset?.style ?? textPresetById("subtitle").style);
    const seg = segments.find((s) => playhead >= s.startSec && playhead < s.startSec + s.durationSec);
    commit(addClip(clips, {
      trackId: "track_text",
      sceneId: seg?.sceneId,
      kind: "text",
      name: text.slice(0, 32),
      text,
      startSec: playhead,
      durationSec: 4,
      volume: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      style: { ...style },
    }));
  }

  function generateCaptions() {
    const existing = new Set(clips.filter((c) => c.kind === "captions").map((c) => c.sceneId));
    const fresh: TimelineClip[] = [];
    for (const seg of segments) {
      if (existing.has(seg.sceneId)) continue;
      const scene = scenes.find((s) => s.id === seg.sceneId);
      const narration = scene?.narration?.trim() || scene?.scriptText?.trim() || "";
      if (!narration) continue;
      for (const cap of captionsFromNarration(narration, seg.startSec, seg.durationSec)) {
        fresh.push({ ...cap, sceneId: seg.sceneId });
      }
    }
    if (fresh.length > 0) {
      commit([...clips, ...fresh]);
    }
  }

  const thumbFor = (clip: TimelineClip): React.ReactNode => {
    if (clip.kind === "image" && clip.assetId) {
      const asset = assets.find((a) => a.id === clip.assetId);
      if (asset?.source === "local-draft" && asset.payload.startsWith("<svg")) {
        return <span aria-hidden="true" className="h-8 w-12 shrink-0 overflow-hidden rounded [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: asset.payload }} />;
      }
    }
    return null;
  };

  const leftPanel = (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-border p-1" role="tablist" aria-label="Studio panels">
        {(["scenes", "media", "text"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={leftTab === t}
            onClick={() => setLeftTab(t)}
            className={cx("h-8 flex-1 rounded-md text-xs font-medium capitalize", leftTab === t ? "bg-muted text-foreground" : "text-muted-text hover:text-foreground")}
          >
            {t}
          </button>
        ))}
      </div>
      {leftTab === "scenes" && (
        <ScenesPanel
          segments={segments}
          issues={issues}
          selectedSceneId={selectedSceneId}
          onSelectScene={(id) => {
            setSelectedSceneId(id);
            const seg = segments.find((s) => s.sceneId === id);
            if (seg) setPlayhead(seg.startSec);
          }}
        />
      )}
      {leftTab === "media" && <MediaPanel assets={assets} onAddAtPlayhead={addAssetAtPlayhead} />}
      {leftTab === "text" && (
        <TextPanel
          brandColor={dna?.positioning ?? ""}
          onAddText={addText}
          onGenerateCaptions={generateCaptions}
          hasNarration={scenes.some((s) => (s.narration || s.scriptText).trim().length > 0)}
        />
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-border p-1" role="tablist" aria-label="Inspector panels">
        {(["inspector", "export"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={rightTab === t}
            onClick={() => setRightTab(t)}
            className={cx("h-8 flex-1 rounded-md text-xs font-medium capitalize", rightTab === t ? "bg-muted text-foreground" : "text-muted-text hover:text-foreground")}
          >
            {t}
          </button>
        ))}
      </div>
      {rightTab === "inspector" ? (
        <Inspector
          clip={selectedClip}
          onPatch={(patch) => {
            if (!selectedClip) return;
            video.setClips(pid, clips.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)));
          }}
          onTrim={(edge, delta) => {
            if (!selectedClip) return;
            commit(trimClip(clips, selectedClip.id, edge, delta));
          }}
          onSplit={() => {
            if (!selectedClip) return;
            commit(splitClipAt(clips, selectedClip.id, playhead));
          }}
        />
      ) : (
        <ExportPanel
          issues={issues}
          health={health}
          duration={duration}
          clipCount={clips.length}
          preset={presetId}
          onPreset={(id) => {
            setPresetId(id);
            const preset = presetById(id);
            video.setCanvas(pid, { preset: preset.id, aspect: preset.aspect, width: preset.width, height: preset.height });
          }}
          quality={quality}
          onQuality={setQuality}
          fps={fps}
          onFps={setFps}
          onSaveRequest={() => {
            const preset = presetById(presetId);
            video.saveRequest({
              projectId: pid,
              preset: preset.label,
              settings: { width: String(preset.width), height: String(preset.height), fps, quality, format: preset.format, aspect: preset.aspect },
              issues,
              health,
              status: "saved",
            });
          }}
          requests={video.requestsFor(pid)}
          onRemoveRequest={video.removeRequest}
        />
      )}
      <SnapshotsPanel projectId={pid} />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }, { label: "Video Studio" }]} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Camera className="size-4 text-muted-text" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{project.name}</p>
        <p className="hidden text-xs text-muted-text sm:block" aria-live="polite">
          {video.savedAt ? `Saved on device · ${new Date(video.savedAt).toLocaleTimeString()}` : "Saving…"}
        </p>
        <Button size="sm" variant="ghost" disabled={!video.canUndo(pid)} onClick={() => video.undo(pid)} title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Undo</span>
        </Button>
        <Button size="sm" variant="ghost" disabled={!video.canRedo(pid)} onClick={() => video.redo(pid)} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Redo</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => (clips.length === 0 ? autoBuild() : setConfirmBuild(true))}>
          <Wand2 className="size-4" aria-hidden="true" />
          {clips.length === 0 ? "Auto-build from scenes" : "Rebuild…"}
        </Button>
      </div>

      <div className="lg:hidden">
        <Tabs
          defaultId="preview"
          tabs={[
            { id: "preview", label: "Preview", content: <PreviewBlock /> },
            { id: "timeline", label: "Timeline", content: <TimelineBlock /> },
            { id: "scenes", label: "Scenes", content: leftPanel },
            { id: "tools", label: "Tools", content: rightPanel },
          ]}
        />
      </div>

      <div className="hidden gap-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <div>{leftPanel}</div>
        <div className="min-w-0 space-y-4">
          <PreviewBlock />
          <TimelineBlock />
        </div>
        <div>{rightPanel}</div>
      </div>
      <VideoStorageNote />

      {confirmBuild && (
        <Modal title="Rebuild timeline?" description="Replaces every clip on the timeline." onClose={() => setConfirmBuild(false)}>
          <p className="text-sm text-muted-text">
            Manual edits, text layers, and timing tweaks on these {clips.length} clip(s) will be replaced by a fresh
            scene build. A snapshot is saved first — restore it if you change your mind.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmBuild(false)}>
              Keep timeline
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                video.saveSnapshot(pid, "Pre-build backup");
                autoBuild();
              }}
            >
              Snapshot + rebuild
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );

  function PreviewBlock() {
    return (
      <Preview
        comp={{ ...composition, canvas }}
        segments={segments}
        duration={duration}
        playhead={playhead}
        onPlayhead={setPlayhead}
        scenes={scenes.map((s) => ({ id: s.id, title: s.title, number: s.number }))}
        assetFor={(assetId) => {
          const a = assets.find((x) => x.id === assetId);
          return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title } : null;
        }}
        blobFor={(assetId) => {
          const a = assets.find((x) => x.id === assetId);
          return a ? mediaApi.blobUrlFor(a.id) : null;
        }}
      />
    );
  }

  function TimelineBlock() {
    return (
      <div onDrop={(e) => {
        // Drop onto empty timeline space appends to a fitting track.
        if (e.dataTransfer.getData("application/x-tuberack-asset")) onDropAsset(e);
      }} onDragOver={(e) => e.preventDefault()}>
        <Timeline
          clips={clips}
          tracks={tracks}
          segments={segments}
          duration={duration}
          playhead={playhead}
          onPlayhead={setPlayhead}
          selectedId={selectedClipId}
          onSelect={setSelectedClipId}
          pxPerSec={pxPerSec}
          onZoom={setPxPerSec}
          snap={snap}
          onToggleSnap={() => setSnap((s) => !s)}
          onMoveClip={(id, newStart) => {
            const target = clips.find((c) => c.id === id);
            if (!target) return;
            commit(moveClip(clips, id, newStart - target.startSec));
          }}
          onSplitSelected={() => {
            if (!selectedClipId) return;
            commit(splitClipAt(clips, selectedClipId, playhead));
          }}
          onDeleteSelected={() => {
            if (!selectedClipId) return;
            commit(deleteClip(clips, selectedClipId));
            setSelectedClipId(null);
          }}
          onDuplicateSelected={() => {
            if (!selectedClipId) return;
            commit(duplicateClip(clips, selectedClipId));
          }}
          onToggleTrack={(trackId, field) => {
            video.setTracks(pid, tracks.map((t) => (t.id === trackId ? { ...t, [field]: !t[field] } : t)));
          }}
          renderThumb={thumbFor}
        />
      </div>
    );
  }

  function SnapshotsPanel({ projectId: id }: { projectId: string }) {
    const [name, setName] = useState("");
    const snaps = video.snapshotsFor(id);
    return (
      <section aria-label="Composition snapshots" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Snapshots (rough cut, review, final)</h3>
        <div className="mt-2 flex gap-1.5">
          <div className="flex-1">
            <Input label="Snapshot name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rough cut" />
          </div>
          <Button size="sm" variant="outline" className="mt-5" onClick={() => { video.saveSnapshot(id, name); setName(""); }}>
            Save
          </Button>
        </div>
        {snaps.length === 0 ? (
          <p className="mt-2 text-xs text-muted-text">No snapshots yet — save before rebuilds and big restructures.</p>
        ) : (
          <ul className="mt-2 space-y-1.5" aria-label="Saved snapshots">
            {snaps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-xs text-muted-text">{new Date(s.at).toLocaleString()}</span>
                </span>
                <button type="button" onClick={() => video.restoreSnapshot(id, s.id)} className="text-xs font-medium underline">
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
}
