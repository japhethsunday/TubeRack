"use client";

import { isChunked } from "@/src/lib/media/chunked";
import { sanitizeSvg } from "@/src/lib/security/svg";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Undo2, Redo2, Wand2, Camera, UploadCloud, Film, Plus, Clipboard, ClipboardPaste } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo, VideoStorageNote } from "@/src/components/video/VideoProvider";
import { useIntelQuery } from "@/src/components/intelligence/chrome";
import { TimelinePro } from "@/src/components/video/TimelinePro";
import { Preview } from "@/src/components/video/Preview";
import { ScenesPanel, MediaPanel, TextPanel, Inspector, ExportPanel } from "@/src/components/video/panels";
import { GeminiCaptions } from "@/src/components/video/GeminiCaptions";
import { PublishButton, type Prerendered } from "@/src/components/video/PublishToYouTube";
import { ClipInspector } from "@/src/components/video/ClipInspector";
import { MediaImporter } from "@/src/components/video/MediaImporter";
import { ExportStudio, sizeFor, type FinishedExport } from "@/src/components/video/ExportStudio";
import { ElementsPanel } from "@/src/components/video/ElementsPanel";
import type { RenderAsset } from "@/src/lib/video/render";
import { Breadcrumb } from "@/src/components/ui/data";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { Tabs } from "@/src/components/ui/Tabs";
import { Modal } from "@/src/components/ui/overlays";
import { Input } from "@/src/components/ui/fields";
import { newTrack, sceneSegments, buildFromScenes, captionsFromNarration, durationOf, validateComposition, healthOf } from "@/src/lib/video/build";
import { moveClip, trimClip, splitClipAt, deleteClip, duplicateClip, addClip, snapTime, snapCandidates, pasteClips, maxDurationFor } from "@/src/lib/video/ops";
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

/** Render exactly one layout (desktop or mobile) so media never decodes twice. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function Studio() {
  const isDesktop = useIsDesktop();
  const { projectId } = useIntelQuery();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const { ready: intelReady, dnaFor } = useIntel();
  const scriptsApi = useScripts();
  const mediaApi = useMedia();
  const video = useVideo();

  const [selectedId, setSelectedId] = useState<string | null>(projectId);
  // Follow ?project= when a link changes it while this page is already open.
  const [syncedProject, setSyncedProject] = useState(projectId);
  if (projectId !== syncedProject) {
    setSyncedProject(projectId);
    setSelectedId(projectId);
  }
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(44);
  const [snap, setSnap] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [locked, setLocked] = useState<Set<string>>(() => new Set());
  const [leftTab, setLeftTab] = useState("media");
  const [clipboard, setClipboard] = useState<TimelineClip[]>([]);
  const [inOut, setInOut] = useState<{ in: number; out: number } | null>(null);
  const [lastExport, setLastExport] = useState<(Prerendered & { exp: FinishedExport }) | null>(null);
  const [publishSignal, setPublishSignal] = useState(0);
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
    () => {
      const clipEnd = durationOf(comp?.clips ?? []);
      const sceneBuilt = (comp?.clips ?? []).some((c) => c.sceneId);
      // Imported-footage timelines end exactly where the last clip ends.
      return sceneBuilt ? Math.max(clipEnd, segments.reduce((n, s) => n + s.durationSec, 0), 1) : Math.max(clipEnd, 1);
    },
    [comp, segments],
  );
  const issues = useMemo(
    () => (comp && project ? validateComposition(comp, scenes, assets) : []),
    [comp, project, scenes, assets],
  );
  const health = healthOf(issues);
  const selectedClip = comp?.clips.find((c) => c.id === selectedClipId) ?? null;

  // Clipboard + in/out marks, bound after the project loads (see actionsRef below).
  const actionsRef = useRef<{ copy: () => void; paste: () => void; markIn: () => void; markOut: () => void; clearMarks: () => void } | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const a = actionsRef.current;
      if (!a) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        a.copy();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        a.paste();
      } else if (!mod && e.key.toLowerCase() === "i") a.markIn();
      else if (!mod && e.key.toLowerCase() === "o") a.markOut();
      else if (!mod && e.key === "Escape") a.clearMarks();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  /** Asset lookup for the compositor/exporter (device bytes resolved to object URLs). */
  const renderAsset = (assetId: string | undefined): RenderAsset | null => {
    const a = assets.find((x) => x.id === assetId);
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: mediaApi.blobUrlFor(a.id) } : null;
  };
  const trackFor = (kind: TimelineClip["kind"]) => tracks.find((t) => t.kind === kind)?.id ?? `track_${kind}`;
  const endOf = (trackId: string) => clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);

  /** Place an asset on the timeline at a time (or appended to its track). */
  function placeAsset(asset: MediaAsset, at?: number, trackId?: string) {
    const kind = asset.kind === "image" || asset.kind === "video" ? asset.kind : asset.kind === "voice" || asset.kind === "sfx" ? asset.kind : "music";
    const tid = trackId ?? trackFor(kind);
    const startSec = at ?? endOf(tid);
    const full = asset.durationSec && asset.durationSec > 0 ? asset.durationSec : kind === "image" ? 5 : 5;
    const seg = segments.find((s) => startSec >= s.startSec && startSec < s.startSec + s.durationSec);
    const next = addClip(clips, {
      trackId: tid,
      sceneId: seg?.sceneId,
      kind,
      name: asset.title,
      assetId: asset.id,
      startSec,
      durationSec: kind === "image" ? 5 : Math.round(full * 100) / 100,
      volume: kind === "music" ? 0.35 : 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      inSec: kind === "image" ? undefined : 0,
      speed: kind === "image" ? undefined : 1,
    });
    commit(next);
    setSelectedClipId(next[next.length - 1].id);
    // First import sets the project frame to the footage's orientation.
    if (kind === "video" && clips.length === 0 && asset.width && asset.height) {
      const vertical = asset.height > asset.width;
      const preset = presetById(vertical ? "shorts" : "youtube");
      video.setCanvas(pid, { ...canvas, preset: preset.id, aspect: preset.aspect, width: preset.width, height: preset.height });
    }
  }

  actionsRef.current = {
    copy: () => {
      const c = clips.find((x) => x.id === selectedClipId);
      if (c) setClipboard([c]);
    },
    paste: () => {
      if (!clipboard.length) return;
      const out = pasteClips(clips, clipboard, playhead);
      commit(out.clips);
      setSelectedClipId(out.pastedIds[0] ?? null);
    },
    markIn: () => setInOut((m) => ({ in: playhead, out: m && m.out > playhead ? m.out : duration })),
    markOut: () => setInOut((m) => ({ in: m && m.in < playhead ? m.in : 0, out: playhead })),
    clearMarks: () => setInOut(null),
  };

  function addTrack(kind: TimelineClip["kind"]) {
    video.setTracks(pid, [...tracks, newTrack(kind, tracks)]);
  }

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
    placeAsset(asset, playhead);
  }

  function onDropAsset(e: React.DragEvent) {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("application/x-tuberack-asset");
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    const candidates = snapCandidates(clips, "", t, segments.map((s) => s.startSec));
    placeAsset(asset, snapTime(t, candidates, snap));
  }

  function addText(presetId: string | null, text: string) {
    const preset = presetId ? textPresetById(presetId) : null;
    const style = preset && preset.id === "title"
      ? brandedTitleStyle(dna?.positioning ?? "", undefined)
      : (preset?.style ?? textPresetById("subtitle").style);
    const seg = segments.find((s) => playhead >= s.startSec && playhead < s.startSec + s.durationSec);
    commit(addClip(clips, {
      trackId: trackFor("text"),
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
        return <span aria-hidden="true" className="h-8 w-12 shrink-0 overflow-hidden rounded [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: sanitizeSvg(asset.payload) }} />;
      }
    }
    return null;
  };

  const leftPanel = (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-border p-1" role="tablist" aria-label="Studio panels">
        {(["media", "text", "elements", "scenes"] as const).map((t) => (
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
      {leftTab === "media" && (
        <div className="space-y-3">
          <MediaImporter projectId={pid} onImported={(asset) => placeAsset(asset)} compact={assets.length > 0} />
          <MediaPanel assets={assets} onAddAtPlayhead={addAssetAtPlayhead} />
        </div>
      )}
      {leftTab === "elements" && (
        <ElementsPanel
          background={canvas.background ?? "#000000"}
          onBackground={(background) => video.setCanvas(pid, { ...canvas, background })}
          onAddElement={(text, style, name) => {
            const next = addClip(clips, {
              trackId: trackFor("text"),
              kind: "text",
              name,
              text,
              startSec: playhead,
              durationSec: 3,
              volume: 1,
              fadeInSec: 0,
              fadeOutSec: 0,
              muted: false,
              textAnim: "pop",
              style: { ...textPresetById("title").style, position: "center", ...style },
            });
            commit(next);
            setSelectedClipId(next[next.length - 1].id);
          }}
        />
      )}
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
        <ClipInspector
          clip={selectedClip}
          tracks={tracks}
          sourceDuration={selectedClip?.assetId ? assets.find((x) => x.id === selectedClip.assetId)?.durationSec : undefined}
          onPatch={(patch) => {
            if (!selectedClip) return;
            let next = { ...selectedClip, ...patch };
            const src = selectedClip.assetId ? assets.find((x) => x.id === selectedClip.assetId)?.durationSec : undefined;
            const cap = maxDurationFor(next, src);
            if (cap !== null && next.durationSec > cap) next = { ...next, durationSec: Math.round(cap * 100) / 100 };
            commit(clips.map((c) => (c.id === selectedClip.id ? next : c)));
          }}
          onSplit={() => selectedClip && commit(splitClipAt(clips, selectedClip.id, playhead))}
          onDuplicate={() => selectedClip && commit(duplicateClip(clips, selectedClip.id))}
          onDelete={() => {
            if (!selectedClip) return;
            commit(deleteClip(clips, selectedClip.id));
            setSelectedClipId(null);
          }}
        />
      ) : (
        <ExportStudio
          comp={{ ...composition, canvas }}
          duration={duration}
          projectName={project.name}
          issues={issues}
          health={health}
          assetFor={renderAsset}
          inOut={inOut}
          onPublish={(exp) => {
            setLastExport({ blob: exp.blob, mime: exp.mime, exp });
            setPublishSignal((n) => n + 1);
          }}
        />
      )}
      <GeminiCaptions clips={clips} assets={assets} onCaptions={commit} />
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
        <Button size="sm" variant="outline" onClick={() => setLeftTab("media")}>
          <UploadCloud className="size-4" aria-hidden="true" /> Import
        </Button>
        {scenes.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => (clips.length === 0 ? autoBuild() : setConfirmBuild(true))}>
            <Wand2 className="size-4" aria-hidden="true" />
            {clips.length === 0 ? "Build from scenes" : "Rebuild…"}
          </Button>
        )}
        {clips.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setRightTab("export")}>
            <Film className="size-4" aria-hidden="true" /> Export
          </Button>
        )}
        {clips.length > 0 && (
          <PublishButton
            source={{
              projectId: pid,
              projectName: project.name,
              topic: project.topic,
              comp: composition,
              duration,
              fps: Number(fps) || 30,
              health,
              blockingIssues: issues.filter((i) => i.severity === "block").map((i) => i.message),
              assetFor: renderAsset,
              render: { ...sizeFor(composition, 1080), fps: Number(fps) || 30 },
            }}
            prerendered={lastExport}
            openSignal={publishSignal}
          />
        )}
      </div>

      {!isDesktop ? (
      <div>
        <Tabs
          defaultId="preview"
          tabs={[
            { id: "preview", label: "Preview", content: PreviewBlock() },
            { id: "timeline", label: "Timeline", content: TimelineBlock() },
            { id: "media", label: "Media", content: leftPanel },
            { id: "tools", label: "Tools", content: rightPanel },
          ]}
        />
      </div>
      ) : (

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <div>{leftPanel}</div>
        <div className="min-w-0 space-y-4">
          {PreviewBlock()}
          {TimelineBlock()}
        </div>
        <div>{rightPanel}</div>
      </div>
      )}
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
        assetFor={renderAsset}
        fps={Number(fps) || 30}
        selectedId={selectedClipId}
        onPlayingChange={setPlaying}
      />
    );
  }

  function TimelineBlock() {
    return (
      <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <label className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
          <Plus className="size-3.5 text-muted-text" aria-hidden="true" />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addTrack(e.target.value as TimelineClip["kind"]);
            }}
            aria-label="Add track"
            className="bg-transparent text-xs font-medium focus:outline-none"
          >
            <option value="">Add track</option>
            <option value="video">Video track</option>
            <option value="image">Image track</option>
            <option value="text">Text track</option>
            <option value="music">Audio track</option>
            <option value="voice">Voice track</option>
            <option value="sfx">SFX track</option>
          </select>
        </label>
        <button type="button" disabled={!selectedClipId} onClick={() => actionsRef.current?.copy()} title="Copy (Ctrl+C)" className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">
          <Clipboard className="size-3.5" aria-hidden="true" /> Copy
        </button>
        <button type="button" disabled={!clipboard.length} onClick={() => actionsRef.current?.paste()} title="Paste at playhead (Ctrl+V)" className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">
          <ClipboardPaste className="size-3.5" aria-hidden="true" /> Paste
        </button>
        <button type="button" onClick={() => actionsRef.current?.markIn()} title="Mark in (I)" className="rounded-lg border border-border bg-surface px-2 py-1 font-medium transition-colors hover:bg-muted">In</button>
        <button type="button" onClick={() => actionsRef.current?.markOut()} title="Mark out (O)" className="rounded-lg border border-border bg-surface px-2 py-1 font-medium transition-colors hover:bg-muted">Out</button>
        {inOut && (
          <span className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 font-medium text-primary">
            {inOut.in.toFixed(2)}s → {inOut.out.toFixed(2)}s
            <button type="button" onClick={() => setInOut(null)} aria-label="Clear in/out" className="ml-1 hover:text-foreground">×</button>
          </span>
        )}
        <span className="ml-auto text-muted-text">{clips.length} clips · {tracks.length} tracks</span>
      </div>
      <div onDrop={(e) => {
        // Drop onto empty timeline space appends to a fitting track.
        if (e.dataTransfer.getData("application/x-tuberack-asset")) onDropAsset(e);
      }} onDragOver={(e) => e.preventDefault()}>
        <TimelinePro
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
          onCommit={commit}
          onToggleTrack={(trackId, field) => {
            video.setTracks(pid, tracks.map((t) => (t.id === trackId ? { ...t, [field]: !t[field] } : t)));
          }}
          assetFor={(assetId) => {
            const a = assets.find((x) => x.id === assetId);
            const r = renderAsset(assetId);
            if (!a || !r) return null;
            const url = r.blobUrl ?? (a.source === "provider-output" && !isChunked(a.payload) && /^(https?:|\/)/.test(a.payload) ? a.payload : null);
            return { url, kind: a.kind, durationSec: a.durationSec, title: a.title };
          }}
          onDropAsset={(assetId, trackId, atSec) => {
            const asset = assets.find((a) => a.id === assetId);
            if (asset) placeAsset(asset, atSec, trackId ?? undefined);
          }}
          onSplit={() => {
            if (selectedClipId) commit(splitClipAt(clips, selectedClipId, playhead));
          }}
          onDelete={() => {
            if (!selectedClipId) return;
            commit(deleteClip(clips, selectedClipId));
            setSelectedClipId(null);
          }}
          onDuplicate={() => {
            if (selectedClipId) commit(duplicateClip(clips, selectedClipId));
          }}
          onSpeed={(speed) => {
            const c = clips.find((x) => x.id === selectedClipId);
            if (!c || speed <= 0) return;
            // Keep the same span of source footage: duration scales inversely.
            const footage = c.durationSec * (c.speed ?? 1);
            const durationSec = Math.max(0.1, Math.round((footage / speed) * 100) / 100);
            commit(clips.map((x) => (x.id === c.id ? { ...x, speed, durationSec } : x)));
          }}
          aspect={canvas.aspect}
          onAspect={(aspect) => {
            const size = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] }[aspect];
            const preset = aspect === "16:9" ? "youtube" : aspect === "9:16" ? "shorts" : aspect === "1:1" ? "square" : "custom";
            video.setCanvas(pid, { ...canvas, preset, aspect, width: size[0], height: size[1] });
          }}
          playing={playing}
          locked={locked}
          onToggleLock={(trackId) =>
            setLocked((prev) => {
              const next = new Set(prev);
              if (next.has(trackId)) next.delete(trackId);
              else next.add(trackId);
              return next;
            })
          }
        />
      </div>
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
