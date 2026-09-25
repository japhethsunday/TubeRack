"use client";

import { defaultFit } from "@/src/lib/video/compositor";
import { useState } from "react";
import { ChevronDown, RotateCcw, FlipHorizontal2, FlipVertical2, Scissors, Copy, Trash2, Rewind } from "lucide-react";
import type { ClipFilters, ClipTransform, TextStyle, TimelineClip, TimelineTrack } from "@/src/lib/video/types";
import { IDENTITY_TRANSFORM, NEUTRAL_FILTERS } from "@/src/lib/video/types";
import { FILTER_PRESETS } from "@/src/lib/video/compositor";
import { TRANSITIONS, MOTIONS, MOTION_LABELS, normalizeTransition, textPresetById } from "@/src/lib/video/presets";
import { maxDurationFor } from "@/src/lib/video/ops";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const FONTS = [
  ["Inter, system-ui, sans-serif", "Inter"],
  ["'Montserrat', 'Arial Black', sans-serif", "Montserrat"],
  ["Impact, 'Arial Black', sans-serif", "Impact"],
  ["Georgia, 'Times New Roman', serif", "Georgia"],
  ["'Courier New', monospace", "Mono"],
  ["'Comic Sans MS', 'Comic Neue', cursive", "Playful"],
] as const;

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border first:border-t-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-text hover:text-foreground">
        {title}
        <ChevronDown className={cx("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && <div className="ui-panel space-y-2.5 pb-3">{children}</div>}
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, format, onReset, neutral }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; onReset?: () => void; neutral?: number }) {
  const changed = neutral !== undefined && Math.abs(value - neutral) > 1e-6;
  return (
    <label className="block text-xs">
      <span className="flex items-center justify-between">
        <span className={cx(changed && "font-medium text-primary")}>{label}</span>
        <span className="flex items-center gap-1 tabular-nums text-muted-text">
          {format ? format(value) : value}
          {changed && onReset && (
            <button type="button" onClick={(e) => { e.preventDefault(); onReset(); }} aria-label={`Reset ${label}`} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
              <RotateCcw className="size-3" aria-hidden="true" />
            </button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-cyan-400" aria-label={label} />
    </label>
  );
}

function Num({ label, value, onChange, step = 0.1, min = 0, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <label className="block text-xs">
      {label}
      <span className="mt-0.5 flex items-center rounded-lg border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40">
        <input type="number" min={min} step={step} value={Number(value.toFixed(3))} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} className="h-8 w-full min-w-0 bg-transparent px-2 text-sm outline-none" />
        {suffix && <span className="pr-2 text-muted-text">{suffix}</span>}
      </span>
    </label>
  );
}

function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <label className="block text-xs">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="mt-0.5 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Properties panel for the selected clip. Every control is non-destructive. */
export function ClipInspector({
  clip,
  tracks,
  sourceDuration,
  onPatch,
  onSplit,
  onDuplicate,
  onDelete,
  onApplyToTrack,
}: {
  clip: TimelineClip | null;
  tracks: TimelineTrack[];
  sourceDuration?: number;
  onPatch: (patch: Partial<TimelineClip>) => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Apply a change to every picture/video clip on the selected clip's track ("vary" gives each a different motion). */
  onApplyToTrack?: (patch: Partial<TimelineClip> | "vary-motion") => void;
}) {
  if (!clip) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">
        <p className="font-medium text-foreground">No clip selected</p>
        <p className="mt-1">Click a clip on the timeline to edit its timing, position, crop, color, speed, audio, and text.</p>
        <ul className="mt-3 space-y-1 text-xs">
          <li><kbd className="rounded border border-border px-1">Space</kbd> play / pause · <kbd className="rounded border border-border px-1">← →</kbd> frame step</li>
          <li><kbd className="rounded border border-border px-1">S</kbd> split · <kbd className="rounded border border-border px-1">Del</kbd> delete · <kbd className="rounded border border-border px-1">⌘C / ⌘V</kbd> copy / paste</li>
          <li><kbd className="rounded border border-border px-1">⌘Z</kbd> undo · <kbd className="rounded border border-border px-1">⇧⌘Z</kbd> redo</li>
        </ul>
      </div>
    );
  }
  const isAudioKind = clip.kind === "voice" || clip.kind === "music" || clip.kind === "sfx";
  const isMedia = clip.kind === "image" || clip.kind === "video";
  const isText = clip.kind === "text" || clip.kind === "captions";
  const hasSound = isAudioKind || clip.kind === "video";
  const tr: ClipTransform = clip.transform ?? IDENTITY_TRANSFORM;
  const fx: ClipFilters = clip.filters ?? NEUTRAL_FILTERS;
  const crop = clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const style: TextStyle = clip.style ?? textPresetById(clip.kind === "captions" ? "subtitle" : "title").style;
  const setT = (p: Partial<ClipTransform>) => onPatch({ transform: { ...tr, ...p } });
  const setF = (p: Partial<ClipFilters>) => onPatch({ filters: { ...fx, ...p } });
  const setS = (p: Partial<TextStyle>) => onPatch({ style: { ...style, ...p } });
  const sameKindTracks = tracks.filter((t) => t.kind === clip.kind);
  const maxDur = maxDurationFor(clip, sourceDuration);
  const speed = clip.speed ?? 1;

  return (
    <div className="rounded-xl border border-border bg-surface px-4 pb-1 pt-3" aria-label={`Properties: ${clip.name}`}>
      <div className="flex items-center gap-2 pb-2">
        <input value={clip.name} onChange={(e) => onPatch({ name: e.target.value })} aria-label="Clip name" className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold hover:bg-muted focus:bg-muted focus:outline-none" />
        <Badge tone="neutral">{clip.kind}</Badge>
      </div>
      <div className="flex gap-1 pb-3">
        <button type="button" onClick={onSplit} title="Split at playhead (S)" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-medium transition-colors hover:bg-muted"><Scissors className="size-3.5" aria-hidden="true" /> Split</button>
        <button type="button" onClick={onDuplicate} title="Duplicate (D)" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-medium transition-colors hover:bg-muted"><Copy className="size-3.5" aria-hidden="true" /> Duplicate</button>
        <button type="button" onClick={onDelete} title="Delete (Del)" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="size-3.5" aria-hidden="true" /> Delete</button>
      </div>

      <Section title="Timing">
        <div className="grid grid-cols-2 gap-2">
          <Num label="Start" suffix="s" value={clip.startSec} onChange={(v) => onPatch({ startSec: v })} />
          <Num label="Duration" suffix="s" min={0.1} value={clip.durationSec} onChange={(v) => onPatch({ durationSec: maxDur ? Math.min(maxDur, v) : v })} />
          {(clip.kind === "video" || isAudioKind) && (
            <Num label="Source in-point" suffix="s" value={clip.inSec ?? 0} onChange={(v) => onPatch({ inSec: sourceDuration ? Math.min(v, sourceDuration - 0.1) : v })} />
          )}
          {sameKindTracks.length > 1 && (
            <Pick label="Track" value={clip.trackId} options={sameKindTracks.map((t) => [t.id, t.label] as const)} onChange={(trackId) => onPatch({ trackId })} />
          )}
        </div>
        {maxDur !== null && <p className="text-[11px] text-muted-text">Source allows up to {maxDur.toFixed(1)}s at this speed.</p>}
      </Section>

      {(clip.kind === "video" || isAudioKind) && (
        <Section title="Speed">
          <div className="flex flex-wrap gap-1">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((s) => (
              <button key={s} type="button" onClick={() => onPatch({ speed: s, durationSec: Math.max(0.1, (clip.durationSec * speed) / s) })} aria-pressed={speed === s} className={cx("rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition-colors", speed === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                {s}×
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-text">Changing speed keeps the same source footage, so the clip gets shorter or longer on the timeline.</p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={Boolean(clip.reverse)} onChange={(e) => onPatch({ reverse: e.target.checked })} />
            <Rewind className="size-3.5" aria-hidden="true" /> Reverse {clip.kind === "video" && <span className="text-muted-text">(video plays backwards silently)</span>}
          </label>
        </Section>
      )}

      {(isMedia || clip.kind === "text") && (
        <Section title="Transform">
          <div className="grid grid-cols-2 gap-x-3">
            <Slider label="Position X" value={tr.x} min={-1} max={1} step={0.01} neutral={0} onReset={() => setT({ x: 0 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(x) => setT({ x })} />
            <Slider label="Position Y" value={tr.y} min={-1} max={1} step={0.01} neutral={0} onReset={() => setT({ y: 0 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(y) => setT({ y })} />
            <Slider label="Scale" value={tr.scale} min={0.1} max={4} step={0.01} neutral={1} onReset={() => setT({ scale: 1 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(scale) => setT({ scale })} />
            <Slider label="Rotation" value={tr.rotation} min={-180} max={180} neutral={0} onReset={() => setT({ rotation: 0 })} format={(v) => `${v}°`} onChange={(rotation) => setT({ rotation })} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setT({ flipH: !tr.flipH })} aria-pressed={tr.flipH} className={cx("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", tr.flipH ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}><FlipHorizontal2 className="size-3.5" aria-hidden="true" /> Flip H</button>
            <button type="button" onClick={() => setT({ flipV: !tr.flipV })} aria-pressed={tr.flipV} className={cx("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", tr.flipV ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}><FlipVertical2 className="size-3.5" aria-hidden="true" /> Flip V</button>
            {[90, 180, 270].map((r) => (
              <button key={r} type="button" onClick={() => setT({ rotation: ((tr.rotation + r + 180) % 360) - 180 })} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">↻ {r}°</button>
            ))}
            <button type="button" onClick={() => onPatch({ transform: IDENTITY_TRANSFORM })} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-text hover:bg-muted hover:text-foreground"><RotateCcw className="size-3" aria-hidden="true" /> Reset</button>
          </div>
          {isMedia && (
            <Pick label="Fit" value={defaultFit(clip)} options={[["contain", "Fit (letterbox)"], ["cover", "Fill (crop to frame)"], ["fill", "Stretch"]] as const} onChange={(fit) => onPatch({ fit })} />
          )}
        </Section>
      )}

      {isMedia && (
        <Section title="Crop" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-x-3">
            {(["top", "bottom", "left", "right"] as const).map((edge) => (
              <Slider key={edge} label={edge[0].toUpperCase() + edge.slice(1)} value={crop[edge]} min={0} max={0.45} step={0.005} neutral={0} onReset={() => onPatch({ crop: { ...crop, [edge]: 0 } })} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onPatch({ crop: { ...crop, [edge]: v } })} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {[["16:9 → 9:16", { left: 0.34, right: 0.34, top: 0, bottom: 0 }], ["Square", { left: 0.22, right: 0.22, top: 0, bottom: 0 }], ["Clear", { top: 0, right: 0, bottom: 0, left: 0 }]].map(([l, c]) => (
              <button key={l as string} type="button" onClick={() => onPatch({ crop: c as typeof crop })} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">{l as string}</button>
            ))}
          </div>
        </Section>
      )}

      {isMedia && (
        <Section title="Color & filters" defaultOpen={false}>
          <div className="grid grid-cols-3 gap-1">
            {FILTER_PRESETS.map((p) => {
              const active = JSON.stringify(p.filters) === JSON.stringify(fx);
              return (
                <button key={p.id} type="button" onClick={() => onPatch({ filters: p.filters })} aria-pressed={active} className={cx("rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-colors", active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <Slider label="Brightness" value={fx.brightness} min={0} max={200} neutral={100} onReset={() => setF({ brightness: 100 })} format={(v) => `${v}%`} onChange={(brightness) => setF({ brightness })} />
          <Slider label="Contrast" value={fx.contrast} min={0} max={200} neutral={100} onReset={() => setF({ contrast: 100 })} format={(v) => `${v}%`} onChange={(contrast) => setF({ contrast })} />
          <Slider label="Saturation" value={fx.saturation} min={0} max={250} neutral={100} onReset={() => setF({ saturation: 100 })} format={(v) => `${v}%`} onChange={(saturation) => setF({ saturation })} />
          <Slider label="Hue" value={fx.hue} min={-180} max={180} neutral={0} onReset={() => setF({ hue: 0 })} format={(v) => `${v}°`} onChange={(hue) => setF({ hue })} />
          <Slider label="Blur" value={fx.blur} min={0} max={30} step={0.5} neutral={0} onReset={() => setF({ blur: 0 })} format={(v) => `${v}px`} onChange={(blur) => setF({ blur })} />
          <Slider label="Grayscale" value={fx.grayscale} min={0} max={100} neutral={0} onReset={() => setF({ grayscale: 0 })} format={(v) => `${v}%`} onChange={(grayscale) => setF({ grayscale })} />
          <Slider label="Warmth (sepia)" value={fx.sepia} min={0} max={100} neutral={0} onReset={() => setF({ sepia: 0 })} format={(v) => `${v}%`} onChange={(sepia) => setF({ sepia })} />
          <Slider label="Vignette" value={fx.vignette} min={0} max={100} neutral={0} onReset={() => setF({ vignette: 0 })} format={(v) => `${v}%`} onChange={(vignette) => setF({ vignette })} />
        </Section>
      )}

      {isMedia && (
        <Section title="Animation">
          <p className="text-[11px] text-muted-text">Brings pictures to life: the move plays across the whole clip.</p>
          <div className="grid grid-cols-3 gap-1">
            {MOTIONS.map((m) => {
              const active = (clip.motion ?? "none") === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPatch({ motion: m })}
                  aria-pressed={active}
                  className={cx("rounded-md border px-1 py-1.5 text-[11px] font-medium transition-colors", active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
                >
                  {MOTION_LABELS[m]}
                </button>
              );
            })}
          </div>
          {(clip.motion ?? "none") !== "none" && (
            <Slider label="Strength" value={clip.motionAmount ?? 1} min={0.25} max={2} step={0.05} neutral={1} onReset={() => onPatch({ motionAmount: 1 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(motionAmount) => onPatch({ motionAmount })} />
          )}
          {onApplyToTrack && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onApplyToTrack({ motion: clip.motion ?? "none", motionAmount: clip.motionAmount ?? 1 })} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                Use on all clips in this track
              </button>
              <button type="button" onClick={() => onApplyToTrack("vary-motion")} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                Mix of moves on all clips
              </button>
            </div>
          )}
        </Section>
      )}

      {isMedia && (
        <Section title="Transition into this clip">
          <div className="grid grid-cols-3 gap-1">
            {TRANSITIONS.map((tDef) => {
              const active = normalizeTransition(clip.transitionIn) === tDef.id;
              return (
                <button
                  key={tDef.id}
                  type="button"
                  title={tDef.blurb}
                  onClick={() => onPatch({ transitionIn: tDef.id, ...(tDef.id !== "cut" && clip.transitionSec === undefined ? { transitionSec: tDef.defaultSec } : {}) })}
                  aria-pressed={active}
                  className={cx("rounded-md border px-1 py-1.5 text-[11px] font-medium transition-colors", active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
                >
                  {tDef.label}
                </button>
              );
            })}
          </div>
          {normalizeTransition(clip.transitionIn) !== "cut" && (
            <Slider label="Length" value={clip.transitionSec ?? 0.6} min={0.2} max={2} step={0.05} neutral={0.6} onReset={() => onPatch({ transitionSec: 0.6 })} format={(v) => `${v.toFixed(2)}s`} onChange={(transitionSec) => onPatch({ transitionSec })} />
          )}
          <p className="text-[11px] text-muted-text">Blends from the clip before it on the same track. The first clip transitions in from black.</p>
          {onApplyToTrack && (
            <button
              type="button"
              onClick={() => onApplyToTrack({ transitionIn: normalizeTransition(clip.transitionIn), transitionSec: clip.transitionSec ?? 0.6 })}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
            >
              Use between all clips in this track
            </button>
          )}
        </Section>
      )}

      {(isMedia || isText) && (
        <Section title="Opacity & fades" defaultOpen={false}>
          <Slider label="Opacity" value={clip.opacity ?? 1} min={0} max={1} step={0.01} neutral={1} onReset={() => onPatch({ opacity: 1 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => onPatch({ opacity })} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Fade in" suffix="s" value={clip.fadeInSec} onChange={(v) => onPatch({ fadeInSec: Math.min(v, clip.durationSec / 2) })} />
            <Num label="Fade out" suffix="s" value={clip.fadeOutSec} onChange={(v) => onPatch({ fadeOutSec: Math.min(v, clip.durationSec / 2) })} />
            {isText && <Pick label="Transition in" value={normalizeTransition(clip.transitionIn)} options={TRANSITIONS.map((t) => [t.id, t.label] as const)} onChange={(transitionIn) => onPatch({ transitionIn })} />}
            <Pick label="Exit (end of clip)" value={normalizeTransition(clip.transitionOut)} options={TRANSITIONS.map((t) => [t.id, t.label] as const)} onChange={(transitionOut) => onPatch({ transitionOut })} />
          </div>
        </Section>
      )}

      {hasSound && (
        <Section title="Audio">
          <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.01} neutral={1} onReset={() => onPatch({ volume: 1 })} format={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => onPatch({ volume })} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Audio fade in" suffix="s" value={clip.fadeInSec} onChange={(v) => onPatch({ fadeInSec: Math.min(v, clip.durationSec / 2) })} />
            <Num label="Audio fade out" suffix="s" value={clip.fadeOutSec} onChange={(v) => onPatch({ fadeOutSec: Math.min(v, clip.durationSec / 2) })} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={clip.muted} onChange={(e) => onPatch({ muted: e.target.checked })} /> Mute this clip
          </label>
        </Section>
      )}

      {isText && (
        <Section title={clip.kind === "captions" ? "Caption" : "Text"}>
          <textarea value={clip.text ?? ""} rows={3} onChange={(e) => onPatch({ text: e.target.value })} aria-label="Text" className="w-full rounded-lg border border-border bg-surface p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <div className="grid grid-cols-2 gap-2">
            <Pick label="Font" value={style.font as string} options={FONTS.some(([f]) => f === style.font) ? FONTS : ([[style.font, "Current"], ...FONTS] as const)} onChange={(font) => setS({ font })} />
            <Pick label="Weight" value={String(style.weight)} options={[["400", "Regular"], ["600", "Semibold"], ["800", "Bold"], ["900", "Black"]] as const} onChange={(w) => setS({ weight: Number(w) })} />
          </div>
          <Slider label="Size" value={style.size} min={12} max={200} neutral={style.size} format={(v) => `${v}`} onChange={(size) => setS({ size })} />
          <div className="grid grid-cols-2 gap-2">
            <Pick label="Align" value={style.align} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]] as const} onChange={(align) => setS({ align })} />
            <Pick label="Position" value={style.position} options={[["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]] as const} onChange={(position) => setS({ position })} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">Color <input type="color" value={style.color.startsWith("#") ? style.color : "#ffffff"} onChange={(e) => setS({ color: e.target.value })} className="h-7 w-9 rounded border border-border" /></label>
            <label className="flex items-center gap-1.5">Box
              <input type="color" value={/^#/.test(style.background) ? style.background : "#000000"} onChange={(e) => setS({ background: e.target.value })} className="h-7 w-9 rounded border border-border" />
            </label>
            <button type="button" onClick={() => setS({ background: "transparent" })} className="rounded-md border border-border px-2 py-1 hover:bg-muted">No box</button>
            <button type="button" onClick={() => setS({ background: "rgba(0,0,0,0.6)" })} className="rounded-md border border-border px-2 py-1 hover:bg-muted">Dark box</button>
          </div>
          {clip.kind === "text" && (
            <Pick label="Animation" value={clip.textAnim ?? "none"} options={[["none", "None"], ["fade", "Fade in"], ["slide-up", "Slide up"], ["pop", "Pop"], ["typewriter", "Typewriter"], ["wipe", "Wipe"]] as const} onChange={(textAnim) => onPatch({ textAnim })} />
          )}
        </Section>
      )}
    </div>
  );
}
