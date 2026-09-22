"use client";

import { useRef, useState } from "react";
import { Magnet, ZoomIn, ZoomOut } from "lucide-react";
import type { SceneSegment } from "@/src/lib/video/build";
import type { TimelineClip, TimelineTrack } from "@/src/lib/video/types";
import { snapTime, snapCandidates } from "@/src/lib/video/ops";
import { cx } from "@/src/components/ui/cx";

const KIND_COLORS: Record<TimelineClip["kind"], string> = {
  video: "bg-indigo-500/70 border-indigo-300",
  image: "bg-sky-600/70 border-sky-300",
  voice: "bg-emerald-600/70 border-emerald-300",
  music: "bg-amber-600/70 border-amber-300",
  sfx: "bg-orange-600/70 border-orange-300",
  text: "bg-violet-600/70 border-violet-300",
  captions: "bg-zinc-500/70 border-zinc-300",
};

/**
 * Timeline: ruler with scene boundaries, 7 tracks, draggable clips,
 * playhead scrubbing, zoom, snap, keyboard editing. All state is real
 * composition state from the provider.
 */
export function Timeline({
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
  onMoveClip,
  onSplitSelected,
  onDeleteSelected,
  onDuplicateSelected,
  onToggleTrack,
  renderThumb,
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
  onMoveClip: (id: string, newStart: number) => void;
  onSplitSelected: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onToggleTrack: (trackId: string, field: "muted" | "hidden") => void;
  renderThumb: (clip: TimelineClip) => React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const dragStart = useRef<{ x: number; origStart: number } | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const width = Math.max(600, Math.ceil((duration + 10) * pxPerSec));
  const selected = clips.find((c) => c.id === selectedId);

  function scrubTo(clientX: number) {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, (clientX - rect.left) / pxPerSec);
    const candidates = snap ? snapCandidates(clips, "", t, segments.map((s) => s.startSec)) : [];
    onPlayhead(snap ? snapTime(t, candidates, true) : Math.round(t * 10) / 10);
  }

  function onClipPointerDown(e: React.PointerEvent, clip: TimelineClip) {
    if (e.button !== 0) return;
    onSelect(clip.id);
    dragStart.current = { x: e.clientX, origStart: clip.startSec };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onClipPointerMove(e: React.PointerEvent, clip: TimelineClip) {
    if (!dragStart.current) return;
    const dxSec = (e.clientX - dragStart.current.x) / pxPerSec;
    setDrag({ id: clip.id, dx: dxSec });
  }

  function onClipPointerUp(e: React.PointerEvent, clip: TimelineClip) {
    if (!dragStart.current) return;
    const dxSec = (e.clientX - dragStart.current.x) / pxPerSec;
    dragStart.current = null;
    setDrag(null);
    if (Math.abs(dxSec) < 0.05) return;
    const raw = Math.max(0, clip.startSec + dxSec);
    const candidates = snapCandidates(clips, clip.id, raw, segments.map((s) => s.startSec));
    onMoveClip(clip.id, snapTime(raw, candidates, snap));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      onPlayhead(Math.max(0, Math.round((playhead + dir * (e.shiftKey ? 5 : 1)) * 10) / 10));
    }
    if (!selected) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDeleteSelected();
    }
    if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      onDuplicateSelected();
    }
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSplitSelected();
    }
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      onPlayhead(Math.max(0, Math.round((selected.startSec + (e.key === "]" ? selected.durationSec : 0)) * 10) / 10));
    }
  }

  const ticks: number[] = [];
  const step = pxPerSec >= 60 ? 1 : pxPerSec >= 24 ? 5 : 10;
  for (let t = 0; t <= Math.ceil(duration) + 5; t += step) ticks.push(t);

  return (
    <section aria-label="Timeline" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-semibold">Timeline</p>
        <span className="text-xs tabular-nums text-muted-text" aria-live="polite">
          {playhead.toFixed(1)}s / {duration.toFixed(1)}s
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleSnap}
            aria-pressed={snap}
            title="Snap to scene edges, clips, and playhead"
            aria-label="Toggle snapping"
            className={cx("rounded-md p-1.5", snap ? "bg-muted text-foreground" : "text-muted-text hover:bg-muted")}
          >
            <Magnet className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onZoom(Math.max(8, pxPerSec - 12))} aria-label="Zoom out timeline" className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground">
            <ZoomOut className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onZoom(Math.min(160, pxPerSec + 12))} aria-label="Zoom in timeline" className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground">
            <ZoomIn className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width }} className="relative">
          <div className="flex">
            <div className="sticky left-0 z-10 w-24 shrink-0 border-r border-border bg-surface" aria-hidden="true" />
            <div
              ref={rulerRef}
              role="slider"
              tabIndex={0}
              aria-label="Playhead position"
              aria-valuemin={0}
              aria-valuemax={Math.ceil(duration)}
              aria-valuenow={Math.round(playhead)}
              aria-valuetext={`${playhead.toFixed(1)} seconds`}
              onPointerDown={(e) => {
                scrubTo(e.clientX);
                const move = (ev: PointerEvent) => scrubTo(ev.clientX);
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
              onKeyDown={onKeyDown}
              className="relative h-8 flex-1 cursor-ew-resize select-none bg-muted/40"
            >
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-border pl-1 text-[10px] text-muted-text" style={{ left: t * pxPerSec }}>
                  {t}s
                </span>
              ))}
              {segments.map((s) => (
                <span
                  key={s.sceneId}
                  title={`Scene ${s.number}: ${s.title}`}
                  className="absolute top-0 h-full w-0.5 bg-primary/60"
                  style={{ left: s.startSec * pxPerSec }}
                />
              ))}
              <span className="absolute top-0 h-full w-0.5 bg-destructive" style={{ left: playhead * pxPerSec }} aria-hidden="true" />
            </div>
          </div>

          {tracks.map((track) => (
            <div key={track.id} className="flex border-t border-border">
              <div className="sticky left-0 z-10 flex w-24 shrink-0 items-center justify-between gap-1 border-r border-border bg-surface px-2 py-1">
                <span className={cx("truncate text-xs font-medium", track.muted && "text-disabled-text line-through")}>
                  {track.label}
                </span>
                <span className="flex shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleTrack(track.id, "muted")}
                    aria-pressed={track.muted}
                    aria-label={track.muted ? `Unmute ${track.label}` : `Mute ${track.label}`}
                    title={track.muted ? `Unmute ${track.label}` : `Mute ${track.label}`}
                    className={cx("rounded p-0.5 text-[10px] font-bold", track.muted ? "bg-muted text-foreground" : "text-muted-text hover:bg-muted")}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrack(track.id, "hidden")}
                    aria-pressed={track.hidden}
                    aria-label={track.hidden ? `Show ${track.label}` : `Hide ${track.label}`}
                    title={track.hidden ? `Show ${track.label}` : `Hide ${track.label}`}
                    className={cx("rounded p-0.5 text-[10px] font-bold", track.hidden ? "bg-muted text-foreground" : "text-muted-text hover:bg-muted")}
                  >
                    H
                  </button>
                </span>
              </div>
              <div className="relative h-14 flex-1" style={{ opacity: track.hidden ? 0.35 : 1 }}>
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const offset = drag?.id === clip.id ? drag.dx * pxPerSec : 0;
                    const isSelected = clip.id === selectedId;
                    return (
                      <div
                        key={clip.id}
                        role="option"
                        tabIndex={0}
                        aria-selected={isSelected}
                        aria-label={`${clip.name}, starts ${clip.startSec} seconds, lasts ${clip.durationSec} seconds${clip.muted ? ", muted" : ""}`}
                        onPointerDown={(e) => onClipPointerDown(e, clip)}
                        onPointerMove={(e) => onClipPointerMove(e, clip)}
                        onPointerUp={(e) => onClipPointerUp(e, clip)}
                        onKeyDown={onKeyDown}
                        onFocus={() => onSelect(clip.id)}
                        style={{
                          left: clip.startSec * pxPerSec + offset,
                          width: Math.max(24, clip.durationSec * pxPerSec),
                          touchAction: "none",
                        }}
                        className={cx(
                          "absolute top-1.5 flex h-11 cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[11px] font-medium text-white select-none active:cursor-grabbing",
                          KIND_COLORS[clip.kind],
                          isSelected && "outline-2 outline-offset-1 outline-white ring-2 ring-primary",
                          clip.muted && "opacity-60",
                        )}
                      >
                        {renderThumb(clip)}
                        <span className="truncate">{clip.name}</span>
                      </div>
                    );
                  })}
                <span className="pointer-events-none absolute top-0 h-full w-0.5 bg-destructive/70" style={{ left: playhead * pxPerSec }} aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-text">
        Drag clips to move · Arrow keys scrub · Delete removes · D duplicates · S splits at playhead · [ ] jump to clip edges
      </p>
    </section>
  );
}
