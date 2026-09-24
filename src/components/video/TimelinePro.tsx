"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Scissors,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Film,
  ImageIcon,
  Mic,
  Music,
  Sparkles,
  Type,
  Captions,
  Gauge,
  Plus,
} from "lucide-react";
import type { TimelineClip, TimelineTrack } from "@/src/lib/video/types";
import type { SceneSegment } from "@/src/lib/video/build";
import { sourceTime } from "@/src/lib/video/compositor";
import { maxDurationFor, hasSource } from "@/src/lib/video/ops";
import { filmstripFor, peaksFor, PEAKS_PER_SEC, type Filmstrip } from "@/src/lib/video/media-cache";
import { cx } from "@/src/components/ui/cx";

const KIND_ICON: Record<TimelineClip["kind"], typeof Film> = { video: Film, image: ImageIcon, voice: Mic, music: Music, sfx: Sparkles, text: Type, captions: Captions };
const KIND_STYLE: Record<TimelineClip["kind"], string> = {
  video: "bg-indigo-500/25 border-indigo-400/70",
  image: "bg-sky-500/25 border-sky-400/70",
  voice: "bg-emerald-500/25 border-emerald-400/70",
  music: "bg-amber-500/25 border-amber-400/70",
  sfx: "bg-orange-500/25 border-orange-400/70",
  text: "bg-violet-500/30 border-violet-400/70",
  captions: "bg-zinc-500/30 border-zinc-400/70",
};
const TRACK_H: Record<TimelineClip["kind"], number> = { video: 64, image: 56, voice: 44, music: 44, sfx: 40, text: 36, captions: 32 };
const HEADER_W = 132;

export interface TimelineAsset {
  url: string | null;
  kind: string;
  durationSec?: number;
  title: string;
}

type DragMode = "move" | "trim-start" | "trim-end";
interface Drag {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  orig: TimelineClip;
  preview: TimelineClip;
  moved: boolean;
}

function fmtRuler(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Filmstrip tiles for a visual clip. */
function ClipFilm({ clip, width, height, asset }: { clip: TimelineClip; width: number; height: number; asset: TimelineAsset | null }) {
  const [strip, setStrip] = useState<Filmstrip | null>(null);
  useEffect(() => {
    let alive = true;
    if (clip.kind === "video" && asset?.url) void filmstripFor(asset.url).then((s) => alive && setStrip(s));
    return () => {
      alive = false;
    };
  }, [clip.kind, asset?.url]);
  if (clip.kind === "image" && asset?.url) {
    return <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: `url("${asset.url}")`, backgroundSize: `${Math.round((height * 16) / 9)}px 100%`, backgroundRepeat: "repeat-x" }} />;
  }
  if (!strip) return null;
  const tileW = Math.max(24, Math.round((height * 16) / 9));
  const tiles = Math.min(200, Math.ceil(width / tileW));
  return (
    <div aria-hidden="true" className="absolute inset-0 flex overflow-hidden opacity-80">
      {Array.from({ length: tiles }, (_, i) => {
        const t = clip.startSec + ((i + 0.5) * tileW * clip.durationSec) / Math.max(1, width);
        const src = sourceTime(clip, t, strip.duration);
        const frame = strip.frames[Math.min(strip.frames.length - 1, Math.floor(src / strip.step))];
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL frames.
        return <img key={i} src={frame} alt="" className="h-full shrink-0 object-cover" style={{ width: tileW }} draggable={false} />;
      })}
    </div>
  );
}

/** Waveform for clips with sound (audio clips and video clips). */
function ClipWave({ clip, width, height, asset, color }: { clip: TimelineClip; width: number; height: number; asset: TimelineAsset | null; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    if (asset?.url) void peaksFor(asset.url).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [asset?.url]);
  const w = Math.min(4000, Math.max(1, Math.round(width)));
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !peaks) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    const mid = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      const t = clip.startSec + (x / c.width) * clip.durationSec;
      const src = sourceTime(clip, t);
      const p = peaks[Math.min(peaks.length - 1, Math.floor(src * PEAKS_PER_SEC))] ?? 0;
      const h = Math.max(1, p * mid * 0.95 * Math.min(2, clip.volume));
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [peaks, clip, color, w]);
  if (!peaks) return null;
  return <canvas ref={ref} width={w} height={height} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/**
 * CapCut-style multi-track timeline: filmstrips and waveforms, drag to move
 * (across compatible tracks), drag edges to trim within the source, snap
 * guides, playhead scrubbing with auto-follow, zoom (buttons, slider,
 * Ctrl/⌘ + wheel, fit), track mute/hide/lock, and an edit toolbar.
 */
export function TimelinePro({
  clips,
  tracks,
  segments,
  duration,
  playhead,
  onPlayhead,
  selectedId,
  onSelect,
  pxPerSec,
  onZoom,
  snap,
  onToggleSnap,
  onCommit,
  onToggleTrack,
  assetFor,
  onDropAsset,
  onSplit,
  onDelete,
  onDuplicate,
  onSpeed,
  aspect,
  onAspect,
  playing,
  locked,
  onToggleLock,
  leading,
  fill = false,
}: {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  segments: SceneSegment[];
  duration: number;
  playhead: number;
  onPlayhead: (t: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pxPerSec: number;
  onZoom: (px: number) => void;
  snap: boolean;
  onToggleSnap: () => void;
  onCommit: (next: TimelineClip[]) => void;
  onToggleTrack: (trackId: string, field: "muted" | "hidden") => void;
  assetFor: (assetId: string | undefined) => TimelineAsset | null;
  onDropAsset: (assetId: string, trackId: string | null, atSec: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSpeed: (speed: number) => void;
  aspect: string;
  onAspect: (aspect: "16:9" | "9:16" | "1:1" | "4:5") => void;
  playing: boolean;
  locked: Set<string>;
  onToggleLock: (trackId: string) => void;
  /** Extra controls placed at the start of the toolbar. */
  leading?: React.ReactNode;
  /** Fill the parent (studio layout) and hide empty secondary tracks. */
  fill?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const totalW = Math.max(800, Math.ceil((duration + 20) * pxPerSec));

  const snapPoints = useMemo(() => {
    const pts = new Set<number>([0, playhead]);
    for (const c of clips) {
      if (drag && c.id === drag.id) continue;
      pts.add(c.startSec);
      pts.add(c.startSec + c.durationSec);
    }
    for (const s of segments) pts.add(s.startSec);
    return [...pts];
  }, [clips, segments, playhead, drag]);

  function snapTo(t: number): { t: number; line: number | null } {
    if (!snap) return { t, line: null };
    const thresh = 8 / pxPerSec;
    let best: number | null = null;
    for (const p of snapPoints) if (Math.abs(p - t) < thresh && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
    return best === null ? { t, line: null } : { t: best, line: best };
  }

  // Keep the playhead in view while playing.
  useEffect(() => {
    if (!playing || !scrollRef.current) return;
    const el = scrollRef.current;
    const x = HEADER_W + playhead * pxPerSec;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft + HEADER_W) el.scrollLeft = Math.max(0, x - HEADER_W - 80);
  }, [playhead, playing, pxPerSec]);

  // Ctrl/⌘ + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const next = Math.max(4, Math.min(400, pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      onZoom(Math.round(next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pxPerSec, onZoom]);

  function timeAt(clientX: number): number {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / pxPerSec);
  }

  function startScrub(e: React.PointerEvent) {
    setScrubbing(true);
    onPlayhead(snapTo(timeAt(e.clientX)).t);
    const move = (ev: PointerEvent) => onPlayhead(Math.min(duration, timeAt(ev.clientX)));
    const up = () => {
      setScrubbing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Photos and video share visual lanes (main track or overlays), like CapCut.
  const visual = (k: TimelineClip["kind"]) => k === "video" || k === "image";
  const sameLane = (a: TimelineClip["kind"], b: TimelineClip["kind"]) => a === b || (visual(a) && visual(b));

  function trackAtY(clientY: number, kind: TimelineClip["kind"]): string | null {
    for (const [id, el] of laneRefs.current) {
      const r = el.getBoundingClientRect();
      const t = tracks.find((x) => x.id === id);
      if (t && sameLane(t.kind, kind) && clientY >= r.top && clientY <= r.bottom && !locked.has(id)) return id;
    }
    return null;
  }

  function beginDrag(e: React.PointerEvent, clip: TimelineClip, mode: DragMode) {
    if (e.button !== 0 || locked.has(clip.trackId)) return;
    e.stopPropagation();
    onSelect(clip.id);
    const d = { id: clip.id, mode, startX: e.clientX, startY: e.clientY, orig: clip, preview: clip, moved: false };
    setDrag({ ...d });
    const srcDur = assetFor(clip.assetId)?.durationSec;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - d.startX) / pxPerSec;
      if (!d.moved && Math.abs(ev.clientX - d.startX) < 3 && Math.abs(ev.clientY - d.startY) < 3) return;
      d.moved = true;
      let next = { ...d.orig };
      if (mode === "move") {
        const raw = Math.max(0, d.orig.startSec + dx);
        const a = snapTo(raw);
        const b = snapTo(raw + d.orig.durationSec);
        const useEnd = b.line !== null && (a.line === null || Math.abs(b.t - (raw + d.orig.durationSec)) < Math.abs(a.t - raw));
        next.startSec = Math.max(0, useEnd ? b.t - d.orig.durationSec : a.t);
        setSnapLine(useEnd ? b.line : a.line);
        const tid = trackAtY(ev.clientY, d.orig.kind);
        if (tid) next.trackId = tid;
      } else if (mode === "trim-start") {
        const speed = d.orig.speed ?? 1;
        const minStart = hasSource(d.orig) ? d.orig.startSec - (d.orig.inSec ?? 0) / speed : 0;
        const s = snapTo(Math.min(d.orig.startSec + d.orig.durationSec - 0.1, Math.max(Math.max(0, minStart), d.orig.startSec + dx)));
        const shift = s.t - d.orig.startSec;
        next = { ...next, startSec: s.t, durationSec: d.orig.durationSec - shift };
        if (hasSource(d.orig)) next.inSec = Math.max(0, (d.orig.inSec ?? 0) + shift * speed);
        setSnapLine(s.line);
      } else {
        const cap = maxDurationFor(d.orig, srcDur);
        const s = snapTo(d.orig.startSec + Math.max(0.1, d.orig.durationSec + dx));
        next.durationSec = Math.max(0.1, Math.min(cap ?? Infinity, s.t - d.orig.startSec));
        setSnapLine(s.line);
      }
      next.startSec = Math.round(next.startSec * 1000) / 1000;
      next.durationSec = Math.round(next.durationSec * 1000) / 1000;
      d.preview = next;
      setDrag({ ...d });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSnapLine(null);
      setDrag(null);
      if (d.moved) onCommit(clips.map((c) => (c.id === d.id ? d.preview : c)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const shown = drag ? clips.map((c) => (c.id === drag.id ? drag.preview : c)) : clips;
  const step = pxPerSec >= 120 ? 1 : pxPerSec >= 40 ? 5 : pxPerSec >= 12 ? 15 : pxPerSec >= 5 ? 30 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 20; t += step) ticks.push(t);

  const btn = "flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

  return (
    <section aria-label="Timeline" className={cx("overflow-hidden bg-surface", fill ? "flex h-full flex-col" : "rounded-xl border border-border")}>
      {/* Edit toolbar */}
      <div className={cx("flex items-center gap-0.5 border-b border-border px-2 py-1", fill ? "shrink-0 overflow-x-auto" : "flex-wrap py-1.5")}>
        {leading}
        {leading && <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />}
        <button type="button" className={btn} disabled={!selected} onClick={onSplit} title="Split at playhead (S)"><Scissors className="size-4" aria-hidden="true" /> Split</button>
        <button type="button" className={btn} disabled={!selected} onClick={onDuplicate} title="Duplicate (D)"><Copy className="size-4" aria-hidden="true" /> Duplicate</button>
        <button type="button" className={cx(btn, "hover:text-destructive")} disabled={!selected} onClick={onDelete} title="Delete (Del)"><Trash2 className="size-4" aria-hidden="true" /> Delete</button>
        <label className={cx(btn, !selected || !(selected && (selected.kind === "video" || hasSource(selected))) ? "pointer-events-none opacity-40" : "")} title="Speed">
          <Gauge className="size-4" aria-hidden="true" />
          <select value={selected?.speed ?? 1} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Clip speed" className="bg-transparent text-xs font-medium focus:outline-none">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <div className="flex items-center rounded-md bg-muted/60 p-0.5" role="radiogroup" aria-label="Aspect ratio">
          {(["16:9", "9:16", "1:1", "4:5"] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={aspect === a} onClick={() => onAspect(a)} className={cx("rounded px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors", aspect === a ? "bg-surface shadow-sm" : "text-muted-text hover:text-foreground")}>
              {a}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-0.5">
          <span className="mr-1 font-mono text-xs tabular-nums text-muted-text">{fmtRuler(playhead)}.{String(Math.floor((playhead % 1) * 100)).padStart(2, "0")}</span>
          <button type="button" onClick={onToggleSnap} aria-pressed={snap} title="Snapping" className={cx(btn, snap && "text-primary")}><Magnet className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => onZoom(Math.max(4, Math.round(pxPerSec / 1.4)))} aria-label="Zoom out" className={btn}><ZoomOut className="size-4" aria-hidden="true" /></button>
          <input type="range" min={4} max={400} value={pxPerSec} onChange={(e) => onZoom(Number(e.target.value))} aria-label="Timeline zoom" className="w-24 accent-cyan-400" />
          <button type="button" onClick={() => onZoom(Math.min(400, Math.round(pxPerSec * 1.4)))} aria-label="Zoom in" className={btn}><ZoomIn className="size-4" aria-hidden="true" /></button>
          <button
            type="button"
            onClick={() => {
              const w = (scrollRef.current?.clientWidth ?? 900) - HEADER_W - 40;
              onZoom(Math.max(4, Math.min(400, Math.floor(w / Math.max(1, duration)))));
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }}
            title="Fit timeline"
            className={btn}
          >
            <Maximize2 className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div
        ref={scrollRef}
        className={cx("relative overflow-auto overscroll-contain bg-[color-mix(in_oklab,var(--surface)_92%,black)]", fill ? "min-h-0 flex-1" : "max-h-[46vh]")}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-tuberack-asset")) e.preventDefault();
        }}
        onDrop={(e) => {
          const assetId = e.dataTransfer.getData("application/x-tuberack-asset");
          if (!assetId) return;
          e.preventDefault();
          const lane = [...laneRefs.current.entries()].find(([, el]) => {
            const r = el.getBoundingClientRect();
            return e.clientY >= r.top && e.clientY <= r.bottom;
          });
          onDropAsset(assetId, lane?.[0] ?? null, snapTo(timeAt(e.clientX)).t);
        }}
      >
        <div style={{ width: HEADER_W + totalW }} className="relative">
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex h-7 border-b border-border bg-surface/95 backdrop-blur">
            <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-surface" style={{ width: HEADER_W }} />
            <div className={cx("relative flex-1 cursor-ew-resize select-none", scrubbing && "cursor-grabbing")} onPointerDown={startScrub} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(playhead)} tabIndex={0}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-border/80 pl-1 font-mono text-[10px] leading-7 text-muted-text" style={{ left: t * pxPerSec }}>
                  {fmtRuler(t)}
                </span>
              ))}
              {segments.map((s) => (
                <span key={s.sceneId} title={`Scene ${s.number}: ${s.title}`} className="absolute bottom-0 h-1.5 w-0.5 bg-primary/70" style={{ left: s.startSec * pxPerSec }} />
              ))}
            </div>
          </div>

          {/* Tracks (studio: main track + tracks that have clips) */}
          {tracks.filter((track, i) => !fill || track.kind === "video" && tracks.findIndex((t) => t.kind === "video") === i || clips.some((c) => c.trackId === track.id)).map((track) => {
            const Icon = KIND_ICON[track.kind];
            const h = TRACK_H[track.kind];
            const isLocked = locked.has(track.id);
            return (
              <div key={track.id} className="flex border-b border-border/70">
                <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-border bg-surface px-2" style={{ width: HEADER_W, height: h }}>
                  <Icon className="size-3.5 shrink-0 text-muted-text" aria-hidden="true" />
                  <span className={cx("min-w-0 flex-1 truncate text-[11px] font-medium", track.hidden && "text-muted-text line-through")}>{track.label}</span>
                  {track.kind !== "text" && track.kind !== "captions" && track.kind !== "image" && (
                    <button type="button" onClick={() => onToggleTrack(track.id, "muted")} aria-pressed={track.muted} aria-label={track.muted ? `Unmute ${track.label}` : `Mute ${track.label}`} className="rounded p-0.5 text-muted-text hover:bg-muted hover:text-foreground">
                      {track.muted ? <VolumeX className="size-3.5" aria-hidden="true" /> : <Volume2 className="size-3.5" aria-hidden="true" />}
                    </button>
                  )}
                  {(track.kind === "video" || track.kind === "image" || track.kind === "text" || track.kind === "captions") && (
                    <button type="button" onClick={() => onToggleTrack(track.id, "hidden")} aria-pressed={track.hidden} aria-label={track.hidden ? `Show ${track.label}` : `Hide ${track.label}`} className="rounded p-0.5 text-muted-text hover:bg-muted hover:text-foreground">
                      {track.hidden ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                    </button>
                  )}
                  <button type="button" onClick={() => onToggleLock(track.id)} aria-pressed={isLocked} aria-label={isLocked ? `Unlock ${track.label}` : `Lock ${track.label}`} className={cx("rounded p-0.5 hover:bg-muted", isLocked ? "text-warning" : "text-muted-text hover:text-foreground")}>
                    {isLocked ? <Lock className="size-3.5" aria-hidden="true" /> : <Unlock className="size-3.5" aria-hidden="true" />}
                  </button>
                </div>
                <div
                  ref={(el) => {
                    if (el) laneRefs.current.set(track.id, el);
                    else laneRefs.current.delete(track.id);
                  }}
                  className={cx("relative flex-1", isLocked && "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(127,127,127,0.06)_6px,rgba(127,127,127,0.06)_12px)]", track.hidden && "opacity-50")}
                  style={{ height: h }}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      onSelect(null);
                      startScrub(e);
                    }
                  }}
                >
                  {shown
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => {
                      const left = clip.startSec * pxPerSec;
                      const width = Math.max(6, clip.durationSec * pxPerSec);
                      const isSel = clip.id === selectedId;
                      const asset = assetFor(clip.assetId);
                      const label = clip.kind === "text" || clip.kind === "captions" ? clip.text || clip.name : clip.name;
                      return (
                        <div
                          key={clip.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSel}
                          aria-label={`${clip.name}: ${clip.startSec.toFixed(2)}s, ${clip.durationSec.toFixed(2)}s long`}
                          onPointerDown={(e) => beginDrag(e, clip, "move")}
                          onFocus={() => onSelect(clip.id)}
                          className={cx(
                            "group absolute top-1 bottom-1 cursor-grab select-none overflow-hidden rounded-md border text-white shadow-sm transition-[box-shadow] active:cursor-grabbing",
                            KIND_STYLE[clip.kind],
                            isSel && "ring-2 ring-cyan-400 ring-offset-1 ring-offset-black",
                            clip.muted && "opacity-60",
                            drag?.id === clip.id && "z-10 shadow-xl",
                          )}
                          style={{ left, width, touchAction: "none" }}
                        >
                          {(clip.kind === "video" || clip.kind === "image") && <ClipFilm clip={clip} width={width} height={h - 8} asset={asset} />}
                          {(clip.kind === "voice" || clip.kind === "music" || clip.kind === "sfx") && <ClipWave clip={clip} width={width} height={h - 8} asset={asset} color="rgba(255,255,255,0.55)" />}
                          {clip.kind === "video" && <div className="absolute inset-x-0 bottom-0 h-3"><ClipWave clip={clip} width={width} height={12} asset={asset} color="rgba(255,255,255,0.5)" /></div>}
                          <span className="relative z-[1] m-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 truncate rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium leading-tight">
                            {(clip.speed ?? 1) !== 1 && <span className="font-bold text-amber-300">{clip.speed}×</span>}
                            {clip.reverse && <span className="font-bold text-amber-300">⟲</span>}
                            <span className="truncate">{label}</span>
                          </span>
                          {!locked.has(clip.trackId) && (
                            <>
                              <span onPointerDown={(e) => beginDrag(e, clip, "trim-start")} className="absolute inset-y-0 left-0 z-[2] w-2 cursor-ew-resize rounded-l-md bg-white/0 transition-colors group-hover:bg-white/40" aria-hidden="true" />
                              <span onPointerDown={(e) => beginDrag(e, clip, "trim-end")} className="absolute inset-y-0 right-0 z-[2] w-2 cursor-ew-resize rounded-r-md bg-white/0 transition-colors group-hover:bg-white/40" aria-hidden="true" />
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}

          {/* Playhead + snap guide */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: HEADER_W + playhead * pxPerSec }}>
            <div className="absolute -left-[6px] top-0 h-3 w-3 rotate-45 rounded-sm bg-rose-500 shadow" />
            <div className="absolute left-0 top-0 h-full w-0.5 -translate-x-1/2 bg-rose-500" />
          </div>
          {snapLine !== null && <div className="pointer-events-none absolute bottom-0 top-7 z-30 w-px bg-amber-300" style={{ left: HEADER_W + snapLine * pxPerSec }} aria-hidden="true" />}
        </div>
      </div>
      <p className={cx("flex-wrap items-center gap-x-3 border-t border-border px-3 py-1 text-[11px] text-muted-text", fill ? "hidden shrink-0 md:flex" : "flex")}>
        <span>Drag clips to move (across tracks) · drag edges to trim</span>
        <span>Space play · S split · Del delete · ⌘C/⌘V · ⌘+wheel zoom</span>
        <Plus className="hidden" aria-hidden="true" />
      </p>
    </section>
  );
}
