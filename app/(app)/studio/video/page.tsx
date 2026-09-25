"use client";

import { BLUR_BACKGROUND } from "@/src/lib/video/compositor";
import { isChunked } from "@/src/lib/media/chunked";
import { sanitizeSvg } from "@/src/lib/security/svg";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Undo2, Redo2, Wand2, Plus, Clipboard, ClipboardPaste, ArrowLeft, ArrowRight, Download, Clapperboard, FolderOpen, Type, Shapes, LayoutList, SlidersHorizontal, X } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo, VideoStorageNote } from "@/src/components/video/VideoProvider";
import { useIntelQuery } from "@/src/components/intelligence/chrome";
import { TimelinePro } from "@/src/components/video/TimelinePro";
import { Preview, fmtTimecode } from "@/src/components/video/Preview";
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
import { useNextStep } from "@/src/components/projects/NextStep";
import { stageLabel } from "@/src/lib/projects/storage";
import { GenerateVideoDialog } from "@/src/components/video/AutoVideo";
import { Portal } from "@/src/components/ui/Portal";
import { Input } from "@/src/components/ui/fields";
import { newTrack, sceneSegments, buildFromScenes, captionsFromNarration, durationOf, validateComposition, healthOf } from "@/src/lib/video/build";
import { moveClip, trimClip, splitClipAt, deleteClip, duplicateClip, addClip, insertClip, fitVisualsTo, snapTime, snapCandidates, pasteClips, maxDurationFor, rippleDelete } from "@/src/lib/video/ops";
import { presetById, textPresetById, brandedTitleStyle } from "@/src/lib/video/presets";
import type { MediaAsset } from "@/src/lib/media/types";
import type { Composition, TimelineClip } from "@/src/lib/video/types";
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
  const step = useNextStep(selectedId ?? projectId, "video");
  const [rawPlayhead, setPlayhead] = useState(0);
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
  // The studio is a full-screen workspace: stop the page behind it scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Dialogs (publish, export, confirmations) mount outside the studio
    // tree: theme the document while the studio is open.
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark", "studio-theme");
    return () => {
      document.body.style.overflow = prev;
      root.classList.remove("studio-theme");
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);
  const [showAutoVideo, setShowAutoVideo] = useState(false);
  // Phone layout: which bottom sheet is open.
  const [sheet, setSheet] = useState<null | "media" | "text" | "elements" | "edit" | "tools">(null);
  const [presetId, setPresetId] = useState("youtube");
  const [quality, setQuality] = useState("Standard");
  const [fps, setFps] = useState("30");
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");

  const ready = projectsReady && intelReady && scriptsApi.ready && mediaApi.ready && video.ready;
  const project = projects.find((p) => p.id === selectedId);
  const comp = project ? video.compFor(project.id) : null;
  const scenes = useMemo(() => (project ? scriptsApi.scenesFor(project.id) : []), [project, scriptsApi]);
  const scriptSections = project ? scriptsApi.scriptFor(project.id)?.sections ?? [] : [];
  const assets = useMemo(() => (project ? mediaApi.assetsFor(project.id) : []), [project, mediaApi]);
  // Only this project's files are downloaded to the device, and only here.
  const { want } = mediaApi;
  useEffect(() => {
    if (assets.length) want(assets.map((a) => a.id));
  }, [assets, want]);
  const dna = project ? dnaFor(project.channelId) : null;

  const segments = useMemo(() => sceneSegments(scenes), [scenes]);
  const duration = useMemo(
    () => {
      // The video ends where its last clip ends — never at the storyboard's
      // planned length (that left a black stretch after the real content).
      const clipEnd = durationOf(comp?.clips ?? []);
      return clipEnd > 0 ? clipEnd : Math.max(segments.reduce((n, s) => n + s.durationSec, 0), 1);
    },
    [comp, segments],
  );
  // The playhead never goes past the end of the video.
  const playhead = Math.min(rawPlayhead, duration);
  const issues = useMemo(
    () => (comp && project ? validateComposition(comp, scenes, assets) : []),
    [comp, project, scenes, assets],
  );
  const health = healthOf(issues);
  const selectedClip = comp?.clips.find((c) => c.id === selectedClipId) ?? null;

  // Clipboard + in/out marks, bound after the project loads (see actionsRef below).
  // Newest timeline + frame, for callbacks created on earlier renders.
  const latest = useRef<{ clips: TimelineClip[]; canvas: Composition["canvas"] }>({ clips: [], canvas: {} as Composition["canvas"] });
  const actionsRef = useRef<{ copy: () => void; paste: () => void; markIn: () => void; markOut: () => void; clearMarks: () => void; split: () => void; remove: () => void; duplicate: () => void} | null>(null);
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
      else if (!mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        a.split();
      } else if (!mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        a.duplicate();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        a.remove();
      }
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
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: mediaApi.blobUrlFor(a.id), durationSec: a.durationSec } : null;
  };
  latest.current = { clips, canvas };
  /** Viewable URL for an asset's bytes (device copy first), or null while unavailable. */
  const mediaUrl = (a: MediaAsset): string | null => {
    const local = mediaApi.blobUrlFor(a.id);
    if (local) return local;
    return a.source === "provider-output" && !isChunked(a.payload) && /^(https?:|\/)/.test(a.payload) ? a.payload : null;
  };
  /** Delete a clip; on the main video track later clips close the gap (CapCut-style magnetic track). */
  const removeClip = (list: TimelineClip[], id: string) => {
    const target = list.find((c) => c.id === id);
    const mainTrack = tracks.find((t) => t.kind === "video")?.id;
    return target && target.trackId === mainTrack ? rippleDelete(list, id) : deleteClip(list, id);
  };
  const trackFor = (kind: TimelineClip["kind"]) => tracks.find((t) => t.kind === kind)?.id ?? `track_${kind}`;
  const endOf = (trackId: string) => latest.current.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);

  /** Place an asset on the timeline at a time (or appended to its track). */
  function placeAsset(asset: MediaAsset, at?: number, trackId?: string) {
    // Imports finish one after another from callbacks created earlier:
    // always build on the newest timeline, never a stale render's copy.
    const clips = latest.current.clips;
    const canvas = latest.current.canvas;
    const kind = asset.kind === "image" || asset.kind === "video" ? asset.kind : asset.kind === "voice" || asset.kind === "sfx" ? asset.kind : "music";
    // Imports go one after another on the main video track (photos too).
    const tid = trackId ?? (kind === "image" ? trackFor("video") : trackFor(kind));
    const startSec = at ?? endOf(tid);
    const full = asset.durationSec && asset.durationSec > 0 ? asset.durationSec : kind === "image" ? 5 : 5;
    const seg = segments.find((s) => startSec >= s.startSec && startSec < s.startSec + s.durationSec);
    // Background music is trimmed to the video (ending with a short fade), so
    // a long song never makes the video longer than its content.
    const contentEnd = Math.max(durationOf(clips.filter((c) => c.kind !== "music")), segments.reduce((n, s) => n + s.durationSec, 0));
    const musicFit = kind === "music" && contentEnd > startSec + 1 ? Math.min(full, contentEnd - startSec) : full;
    // Never drop a clip on top of another: the main track makes room,
    // other tracks use the next free gap.
    const mainTrackId = trackFor("video");
    const next = insertClip(clips, {
      trackId: tid,
      sceneId: seg?.sceneId,
      kind,
      name: asset.title,
      assetId: asset.id,
      startSec,
      durationSec: kind === "image" ? 5 : Math.round(musicFit * 100) / 100,
      volume: kind === "music" ? 0.35 : 1,
      fadeInSec: 0,
      fadeOutSec: kind === "music" && musicFit < full ? Math.min(3, musicFit / 4) : 0,
      muted: false,
      inSec: kind === "image" ? undefined : 0,
      speed: kind === "image" ? undefined : 1,
    }, tid === mainTrackId);
    commit(next);
    setSelectedClipId(next[next.length - 1].id);
    // First import sets the project frame to the footage's orientation.
    if (kind === "video" && clips.length === 0 && asset.width && asset.height) {
      const vertical = asset.height > asset.width;
      const preset = presetById(vertical ? "shorts" : "youtube");
      const nextCanvas = { ...canvas, preset: preset.id, aspect: preset.aspect, width: preset.width, height: preset.height };
      video.setCanvas(pid, nextCanvas);
      latest.current = { ...latest.current, canvas: nextCanvas };
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
    split: () => {
      if (selectedClipId) commit(splitClipAt(latest.current.clips, selectedClipId, playhead));
    },
    remove: () => {
      if (!selectedClipId) return;
      commit(removeClip(latest.current.clips, selectedClipId));
      setSelectedClipId(null);
    },
    duplicate: () => {
      if (selectedClipId) commit(duplicateClip(latest.current.clips, selectedClipId, latest.current.clips.find((c) => c.id === selectedClipId)?.trackId === trackFor("video")));
    },
  };

  function addTrack(kind: TimelineClip["kind"]) {
    video.setTracks(pid, [...tracks, newTrack(kind, tracks)]);
  }

  function commit(next: TimelineClip[]) {
    video.commitClips(pid, latest.current.clips, next);
    latest.current = { ...latest.current, clips: next };
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
    commit(insertClip(clips, {
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
          <MediaImporter projectId={pid} onImported={(asset) => placeAsset(asset)} compact />
          <MediaPanel assets={assets} onAddAtPlayhead={addAssetAtPlayhead} urlFor={mediaUrl} />
        </div>
      )}
      {leftTab === "elements" && (
        <ElementsPanel
          background={canvas.background ?? BLUR_BACKGROUND}
          onBackground={(background) => video.setCanvas(pid, { ...canvas, background })}
          onAddElement={(text, style, name) => {
            const next = insertClip(clips, {
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
      <div className="-mx-3 -mt-3 mb-1 flex border-b border-border px-1" role="tablist" aria-label="Inspector panels">
        {(["inspector", "export"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={rightTab === t}
            onClick={() => setRightTab(t)}
            className={cx("-mb-px h-10 flex-1 border-b-2 text-xs font-semibold capitalize transition-colors", rightTab === t ? "border-primary text-foreground" : "border-transparent text-muted-text hover:text-foreground")}
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
          onDuplicate={() => selectedClip && commit(duplicateClip(clips, selectedClip.id, selectedClip.trackId === trackFor("video")))}
          onDelete={() => {
            if (!selectedClip) return;
            commit(removeClip(clips, selectedClip.id));
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

  const publishSource = {
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
  };
  const LEFT_TABS = [
    { id: "media", label: "Media", icon: FolderOpen },
    { id: "text", label: "Text", icon: Type },
    { id: "elements", label: "Elements", icon: Shapes },
    { id: "scenes", label: "Scenes", icon: LayoutList },
  ] as const;
  const saveLabel = video.savedAt ? `Saved ${new Date(video.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saving…";

  const topBar = (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 sm:px-3">
      <Link href={`/projects/${project.id}`} aria-label="Back to project" className="flex size-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
      </Link>
      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-sm font-semibold sm:max-w-[260px]">{project.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-muted-text" aria-live="polite">
          <span className={cx("size-1.5 rounded-full", video.savedAt ? "bg-emerald-400" : "bg-amber-400")} aria-hidden="true" />
          <span className="sm:hidden">{video.savedAt ? "Saved" : "Saving…"}</span>
          <span className="hidden sm:inline">{saveLabel}</span>
        </p>
      </div>
      <div className="ml-1 hidden items-center sm:flex">
        <button type="button" disabled={!video.canUndo(pid)} onClick={() => video.undo(pid)} title="Undo (Ctrl+Z)" aria-label="Undo" className="flex size-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-foreground disabled:opacity-30">
          <Undo2 className="size-4" aria-hidden="true" />
        </button>
        <button type="button" disabled={!video.canRedo(pid)} onClick={() => video.redo(pid)} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="flex size-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-foreground disabled:opacity-30">
          <Redo2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1" />
      {scriptSections.some((x) => x.text.trim()) && (
        <Button size="sm" variant="ghost" title="Voice-over, visuals and captions from this project's script" onClick={() => setShowAutoVideo(true)}>
          <Clapperboard className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">From script</span>
          <span className="sr-only md:hidden">Generate video from script</span>
        </Button>
      )}
      {scenes.length > 0 && (
        <Button size="sm" variant="ghost" title="Build the timeline from your storyboard scenes" onClick={() => (clips.length === 0 ? autoBuild() : setConfirmBuild(true))}>
          <Wand2 className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">{clips.length === 0 ? "Build from scenes" : "Rebuild…"}</span>
          <span className="sr-only md:hidden">Build from scenes</span>
        </Button>
      )}
      {clips.length > 0 && (
        <span className="hidden sm:block">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRightTab("export");
            setSheet("tools");
          }}
        >
          <Download className="size-4" aria-hidden="true" /> Export
        </Button>
        </span>
      )}
      {clips.length > 0 && <PublishButton source={publishSource} prerendered={lastExport} openSignal={publishSignal} />}
      {step?.next && (
        <button
          type="button"
          onClick={step.advance}
          title={`Mark the video stage done and continue to ${stageLabel(step.next)}`}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-text hover:bg-muted hover:text-foreground"
        >
          <span className="hidden lg:inline">Next: {stageLabel(step.next)}</span>
          <ArrowRight className="size-4" aria-hidden="true" />
          <span className="sr-only lg:hidden">Next step: {stageLabel(step.next)}</span>
        </button>
      )}
    </header>
  );

  return (
    // Portal: the page-transition wrapper is transformed, which would trap a
    // fixed full-screen layer inside it.
    <Portal>
    <div className="dark studio-theme fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      {topBar}
      {isDesktop ? (
        <>
          <div className="flex min-h-0 flex-1">
            <nav aria-label="Studio panels" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2" role="tablist">
              {LEFT_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={leftTab === t.id}
                  onClick={() => setLeftTab(t.id)}
                  className={cx("flex w-14 flex-col items-center gap-1 rounded-md py-2 text-[10px] font-medium transition-colors", leftTab === t.id ? "bg-muted text-primary" : "text-muted-text hover:bg-muted/60 hover:text-foreground")}
                >
                  <t.icon className="size-5" aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </nav>
            <aside aria-label={LEFT_TABS.find((t) => t.id === leftTab)?.label} className="w-[300px] shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
              {leftPanel}
            </aside>
            <main className="min-w-0 flex-1">{PreviewBlock("viewer")}</main>
            <aside aria-label="Inspector" className="w-[320px] shrink-0 overflow-y-auto border-l border-border bg-surface p-3">
              {rightPanel}
            </aside>
          </div>
          <div className="isolate h-[36vh] min-h-[220px] shrink-0 border-t border-border">{TimelineBlock()}</div>
        </>
      ) : (
        <>
          <main className="isolate h-[42vh] shrink-0">{PreviewBlock("viewer")}</main>
          <div className="isolate min-h-0 flex-1 border-t border-border">{TimelineBlock()}</div>
          <nav aria-label="Studio tools" className="grid shrink-0 grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
            {([
              { id: "media", label: "Import", icon: FolderOpen },
              { id: "text", label: "Text", icon: Type },
              { id: "elements", label: "Elements", icon: Shapes },
              { id: "edit", label: "Edit", icon: SlidersHorizontal },
              { id: "tools", label: "Export", icon: Download },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id === "media" || t.id === "text" || t.id === "elements") setLeftTab(t.id);
                  if (t.id === "edit") setRightTab("inspector");
                  if (t.id === "tools") setRightTab("export");
                  setSheet(sheet === t.id ? null : t.id);
                }}
                aria-pressed={sheet === t.id}
                className={cx("flex flex-col items-center gap-1 py-2 text-[10px] font-medium", sheet === t.id ? "text-primary" : "text-muted-text")}
              >
                <t.icon className="size-5" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </nav>
          {sheet && (
            <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[62vh] flex-col rounded-t-2xl border-t border-border bg-elevated shadow-[0_-12px_40px_rgba(0,0,0,0.5)]" role="dialog" aria-label="Studio panel">
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2">
                <span className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden="true" />
                <button type="button" onClick={() => setSheet(null)} aria-label="Close panel" className="absolute right-3 top-2 rounded-md p-1 text-muted-text hover:bg-muted hover:text-foreground">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto p-3 pt-1">{sheet === "edit" || sheet === "tools" ? rightPanel : leftPanel}</div>
            </div>
          )}
        </>
      )}

      {showAutoVideo && <GenerateVideoDialog project={project} sections={scriptSections} wpm={scriptsApi.scriptFor(project.id)?.wpm ?? 150} onClose={() => setShowAutoVideo(false)} />}
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
    </Portal>
  );

  function PreviewBlock(variant: "card" | "viewer" = "card") {
    return (
      <Preview
        variant={variant}
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
    const tool = "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-text transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
    const leading = (
      <>
        <label className={tool} title="Add track">
          <Plus className="size-4" aria-hidden="true" />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addTrack(e.target.value as TimelineClip["kind"]);
            }}
            aria-label="Add track"
            className="w-4 cursor-pointer appearance-none bg-transparent text-transparent focus:outline-none"
          >
            <option value="">Add track</option>
            <option value="video">Video / overlay track</option>
            <option value="text">Text track</option>
            <option value="music">Audio track</option>
            <option value="voice">Voice track</option>
            <option value="sfx">SFX track</option>
          </select>
        </label>
        <button type="button" disabled={!selectedClipId} onClick={() => actionsRef.current?.copy()} title="Copy (Ctrl+C)" aria-label="Copy" className={tool}>
          <Clipboard className="size-4" aria-hidden="true" />
        </button>
        <button type="button" disabled={!clipboard.length} onClick={() => actionsRef.current?.paste()} title="Paste at playhead (Ctrl+V)" aria-label="Paste" className={tool}>
          <ClipboardPaste className="size-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => actionsRef.current?.markIn()} title="Mark in (I)" className={tool}>In</button>
        <button type="button" onClick={() => actionsRef.current?.markOut()} title="Mark out (O)" className={tool}>Out</button>
        {inOut && (
          <span className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 text-xs font-medium text-primary">
            {inOut.in.toFixed(2)}s → {inOut.out.toFixed(2)}s
            <button type="button" onClick={() => setInOut(null)} aria-label="Clear in/out" className="ml-1 hover:text-foreground">×</button>
          </span>
        )}
      </>
    );
    // Pictures and voice-over out of step (black screen or silent pictures at the end)?
    const voiceEnd = clips.filter((c) => c.kind === "voice").reduce((n, c) => Math.max(n, c.startSec + c.durationSec), 0);
    const pictureEnd = clips.filter((c) => c.kind === "image" || c.kind === "video").reduce((n, c) => Math.max(n, c.startSec + c.durationSec), 0);
    const mismatch = voiceEnd > 0 && pictureEnd > 0 && Math.abs(voiceEnd - pictureEnd) > 1.5;
    return (
      <div className="flex h-full flex-col" onDrop={(e) => {
        // Drop onto empty timeline space appends to a fitting track.
        if (e.dataTransfer.getData("application/x-tuberack-asset")) onDropAsset(e);
      }} onDragOver={(e) => e.preventDefault()}>
        {mismatch && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs">
            <span className="min-w-0 flex-1">
              {pictureEnd < voiceEnd
                ? `Pictures end at ${fmtTimecode(pictureEnd, 30, false)} but the voice-over runs to ${fmtTimecode(voiceEnd, 30, false)} — the rest would be a black screen.`
                : `Pictures run to ${fmtTimecode(pictureEnd, 30, false)} but the voice-over ends at ${fmtTimecode(voiceEnd, 30, false)} — the end would be silent.`}
            </span>
            <button
              type="button"
              onClick={() => commit(fitVisualsTo(latest.current.clips, voiceEnd))}
              className="rounded-md bg-warning px-2.5 py-1 font-semibold text-black hover:opacity-90"
            >
              Fit pictures to voice
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
        <TimelinePro
          fill
          leading={leading}
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
          onTrackVolume={(trackId, volume) => {
            video.setTracks(pid, tracks.map((t) => (t.id === trackId ? { ...t, volume } : t)));
          }}
          assetFor={(assetId) => {
            const a = assets.find((x) => x.id === assetId);
            return a ? { url: mediaUrl(a), kind: a.kind, durationSec: a.durationSec, title: a.title } : null;
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
            commit(removeClip(clips, selectedClipId));
            setSelectedClipId(null);
          }}
          onDuplicate={() => {
            if (selectedClipId) commit(duplicateClip(clips, selectedClipId, clips.find((c) => c.id === selectedClipId)?.trackId === trackFor("video")));
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
