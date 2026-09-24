"use client";

import { useMedia } from "@/src/components/media/MediaProvider";
import { isChunked } from "@/src/lib/media/chunked";
import { useState } from "react";
import { Film, ImagePlus, Type, Captions, AlertTriangle, CheckCircle2, OctagonX, Download } from "lucide-react";
import type { SceneSegment } from "@/src/lib/video/build";
import { durationOf } from "@/src/lib/video/build";
import type { MediaAsset } from "@/src/lib/media/types";
import type { TimelineClip, ValidationIssue, HealthState, RenderRequest } from "@/src/lib/video/types";
import { PLATFORM_PRESETS, TEXT_PRESETS, TRANSITIONS, EFFECTS, MOTIONS, textPresetById, brandedTitleStyle } from "@/src/lib/video/presets";
import { formatDuration } from "@/src/lib/script/measure";
import { Button } from "@/src/components/ui/Button";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { Modal } from "@/src/components/ui/overlays";
import { cx } from "@/src/components/ui/cx";

/** Scene list with durations, warnings, and selection. Order edits live in Storyboard. */
export function ScenesPanel({
  segments,
  issues,
  selectedSceneId,
  onSelectScene,
}: {
  segments: SceneSegment[];
  issues: ValidationIssue[];
  selectedSceneId: string | null;
  onSelectScene: (id: string | null) => void;
}) {
  if (segments.length === 0) {
    return <EmptyState title="No scenes" body="Build scenes in the Storyboard — they tile the timeline here automatically." />;
  }
  return (
    <ul className="space-y-1.5" aria-label="Scenes">
      {segments.map((s) => {
        const blocks = issues.filter((i) => i.scene && i.severity === "block" && i.message.includes(`Scene ${s.number}`));
        const warns = issues.filter((i) => i.scene && i.severity === "warn" && i.message.includes(`Scene ${s.number}`));
        const selected = selectedSceneId === s.sceneId;
        return (
          <li key={s.sceneId}>
            <button
              type="button"
              onClick={() => onSelectScene(selected ? null : s.sceneId)}
              aria-pressed={selected}
              className={cx("w-full rounded-lg border p-2.5 text-left transition-colors", selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-text/50")}
            >
              <p className="flex items-center justify-between gap-2 text-sm font-medium">
                <span className="flex items-center gap-1.5">
                  <Film className="size-3.5 text-muted-text" aria-hidden="true" />
                  {s.number}. {s.title}
                </span>
                <span className="text-xs font-normal tabular-nums text-muted-text">{formatDuration(s.durationSec)}</span>
              </p>
              <p className="mt-1 flex gap-1.5 text-[11px]">
                {blocks.length > 0 && <Badge tone="bad">{blocks.length} blocking</Badge>}
                {warns.length > 0 && <Badge tone="warn">{warns.length} to review</Badge>}
                {blocks.length === 0 && warns.length === 0 && <Badge tone="ok">Covered</Badge>}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Approved-asset browser: add to playhead (keyboard path) or drag to timeline. */
export function MediaPanel({
  assets,
  onAddAtPlayhead,
}: {
  assets: MediaAsset[];
  onAddAtPlayhead: (asset: MediaAsset) => void;
}) {
  const usable = assets.filter((a) => a.status === "ready" && a.source !== "provider-request");
  const [dragging, setDragging] = useState<string | null>(null);
  const { blobUrlFor, downloads } = useMedia();
  // Where the bytes are, so a clip never silently shows up blank.
  const availability = (a: MediaAsset): { text: string; warn: boolean } | null => {
    if (a.id in downloads) return { text: `Downloading from your account… ${Math.round(downloads[a.id] * 100)}%`, warn: false };
    if (blobUrlFor(a.id)) return null;
    if (a.source === "upload-session") return { text: "Only on the device it was imported on", warn: true };
    if (isChunked(a.payload)) return { text: "Waiting to download…", warn: false };
    return null;
  };
  if (usable.length === 0) {
    return <EmptyState title="No placeable media" body="Generated media, drafts, and uploads appear here once they are ready." />;
  }
  return (
    <ul className="space-y-1.5" aria-label="Placeable media">
      {usable.slice(0, 30).map((a) => (
        <li
          key={a.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-tuberack-asset", a.id);
            e.dataTransfer.effectAllowed = "copy";
            setDragging(a.id);
          }}
          onDragEnd={() => setDragging(null)}
          className={cx("flex items-center justify-between gap-2 rounded-lg border border-border p-2.5", dragging === a.id && "opacity-50")}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{a.title}</span>
            <span className="block text-[11px] text-muted-text">{a.kind} · {a.source === "local-draft" ? "draft" : "upload"}{a.durationSec ? ` · ${a.durationSec.toFixed(1)}s` : ""}</span>
            {(() => {
              const where = availability(a);
              return where && <span className={cx("block text-[11px]", where.warn ? "text-warning" : "text-primary")}>{where.text}</span>;
            })()}
          </span>
          <Button size="sm" variant="outline" onClick={() => onAddAtPlayhead(a)}>
            <ImagePlus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </li>
      ))}
      {usable.length > 30 && <li className="text-xs text-muted-text">Showing 30 of {usable.length} — refine in the Media Studio.</li>}
    </ul>
  );
}

/** Text layers: presets seeded from brand, custom adds, caption generation. */
export function TextPanel({
  brandColor,
  onAddText,
  onGenerateCaptions,
  hasNarration,
}: {
  brandColor: string;
  onAddText: (presetId: string | null, text: string) => void;
  onGenerateCaptions: () => void;
  hasNarration: boolean;
}) {
  const [custom, setCustom] = useState("");
  const [preset, setPreset] = useState("subtitle");
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-text">Presets {brandColor.trim() ? "(brand color applied to titles)" : "(set brand colors in DNA)"}</p>
        <ul className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Text presets">
          {TEXT_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onAddText(p.id, p.id === "title" ? "Title" : p.id === "subtitle" ? "Subtitle text" : `${p.label} text`)}
                className="w-full rounded-lg border border-border p-2 text-left text-xs font-medium hover:bg-muted"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Input label="Custom text layer" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Lower third name…" />
        </div>
        <Select label="Style" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {TEXT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </div>
      <Button size="sm" variant="outline" onClick={() => { if (custom.trim()) { onAddText(preset, custom.trim()); setCustom(""); } }}>
        <Type className="size-4" aria-hidden="true" />
        Add text at playhead
      </Button>
      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Captions className="size-3.5" aria-hidden="true" />
          Captions from narration
        </p>
        <p className="mt-1 text-xs text-muted-text">Derives sentence-timed caption clips from scene narration. Editable after — never invented without audio text.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onGenerateCaptions} disabled={!hasNarration}>
          Generate caption clips
        </Button>
      </div>
    </div>
  );
}

/** Inspector: only the controls relevant to the selected clip kind. */
export function Inspector({
  clip,
  onPatch,
  onTrim,
  onSplit,
}: {
  clip: TimelineClip | null;
  onPatch: (patch: Partial<TimelineClip>) => void;
  onTrim: (edge: "start" | "end", delta: number) => void;
  onSplit: () => void;
}) {
  if (!clip) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">Select a clip to inspect it. Ruler and clips are keyboard-operable.</p>;
  }
  const isAudio = clip.kind === "voice" || clip.kind === "music" || clip.kind === "sfx";
  const isVisual = clip.kind === "image" || clip.kind === "video";
  const isText = clip.kind === "text" || clip.kind === "captions";
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label={`Inspector: ${clip.name}`}>
      <p className="flex items-center justify-between gap-2 text-sm font-semibold">
        {clip.name}
        <Badge tone="neutral">{clip.kind}</Badge>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Start (s)
          <input type="number" min={0} step={0.1} value={clip.startSec} onChange={(e) => onPatch({ startSec: Math.max(0, Number(e.target.value) || 0) })} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
        </label>
        <label className="text-xs">Duration (s)
          <input type="number" min={0.5} step={0.1} value={clip.durationSec} onChange={(e) => onPatch({ durationSec: Math.max(0.5, Number(e.target.value) || 0.5) })} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => onTrim("start", -0.5)}>Trim ←</Button>
        <Button size="sm" variant="ghost" onClick={() => onTrim("start", 0.5)}>→ Trim</Button>
        <Button size="sm" variant="ghost" onClick={() => onSplit()}>Split at playhead</Button>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={clip.muted} onChange={(e) => onPatch({ muted: e.target.checked })} className="size-4" />
          Muted
        </label>
      </div>
      {isAudio && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">Volume
            <input type="range" min={0} max={1} step={0.05} value={clip.volume} onChange={(e) => onPatch({ volume: Number(e.target.value) })} className="flex-1" aria-label="Clip volume" />
            <span className="w-9 text-right tabular-nums">{Math.round(clip.volume * 100)}%</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Fade in (s)
              <input type="number" min={0} step={0.1} value={clip.fadeInSec} onChange={(e) => onPatch({ fadeInSec: Math.max(0, Number(e.target.value) || 0) })} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
            </label>
            <label className="text-xs">Fade out (s)
              <input type="number" min={0} step={0.1} value={clip.fadeOutSec} onChange={(e) => onPatch({ fadeOutSec: Math.max(0, Number(e.target.value) || 0) })} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
            </label>
          </div>
        </div>
      )}
      {isVisual && (
        <div className="grid grid-cols-2 gap-2">
          <Select label="Motion" value={clip.motion ?? "none"} onChange={(e) => onPatch({ motion: e.target.value })}>
            {(["none", "kenburns", "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"] as const).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Select label="Transition in" value={clip.transitionIn ?? "cut"} onChange={(e) => onPatch({ transitionIn: e.target.value })}>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
          <Select label="Transition out" value={clip.transitionOut ?? "cut"} onChange={(e) => onPatch({ transitionOut: e.target.value })}>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
          <Select label="Effect" value={clip.effectIds?.[0] ?? ""} onChange={(e) => onPatch({ effectIds: e.target.value ? [e.target.value] : [] })}>
            <option value="">None</option>
            {EFFECTS.map((fx) => (
              <option key={fx.id} value={fx.id}>{fx.label} — {fx.blurb}</option>
            ))}
          </Select>
        </div>
      )}
      {isText && (
        <div className="space-y-2">
          <Textarea label="Text" rows={2} value={clip.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">Size
              <input type="number" min={12} max={120} value={clip.style?.size ?? 32} onChange={(e) => onPatch({ style: { ...(clip.style ?? textPresetById("subtitle").style), size: Number(e.target.value) || 32 } })} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
            </label>
            <Select label="Align" value={clip.style?.align ?? "center"} onChange={(e) => onPatch({ style: { ...(clip.style ?? textPresetById("subtitle").style), align: e.target.value as "left" | "center" | "right" } })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </Select>
            <Select label="Position" value={clip.style?.position ?? "bottom"} onChange={(e) => onPatch({ style: { ...(clip.style ?? textPresetById("subtitle").style), position: e.target.value as "top" | "center" | "bottom" } })}>
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">Color
            <input type="color" value={clip.style?.color ?? "#ffffff"} onChange={(e) => onPatch({ style: { ...(clip.style ?? textPresetById("subtitle").style), color: e.target.value } })} className="h-8 w-12 rounded border border-border" />
          </label>
        </div>
      )}
    </div>
  );
}

const HEALTH_META: Record<HealthState, { label: string; tone: "ok" | "warn" | "bad"; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready", tone: "ok", icon: CheckCircle2 },
  review: { label: "Needs review", tone: "warn", icon: AlertTriangle },
  blocked: { label: "Blocked", tone: "bad", icon: OctagonX },
};

/** Export: presets, validation, health, saved render requests. */
export function ExportPanel({
  issues,
  health,
  duration,
  clipCount,
  preset,
  onPreset,
  quality,
  onQuality,
  fps,
  onFps,
  onSaveRequest,
  requests,
  onRemoveRequest,
}: {
  issues: ValidationIssue[];
  health: HealthState;
  duration: number;
  clipCount: number;
  preset: string;
  onPreset: (id: string) => void;
  quality: string;
  onQuality: (q: string) => void;
  fps: string;
  onFps: (f: string) => void;
  onSaveRequest: () => void;
  requests: RenderRequest[];
  onRemoveRequest: (id: string) => void;
}) {
  const meta = HEALTH_META[health];
  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <section aria-label="Output settings" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Output</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Select label="Preset" value={preset} onChange={(e) => onPreset(e.target.value)}>
            {PLATFORM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label} · {p.aspect} · {p.width}×{p.height}</option>
            ))}
          </Select>
          <Select label="Quality" value={quality} onChange={(e) => onQuality(e.target.value)}>
            {["Draft", "Standard", "High"].map((q) => (
              <option key={q}>{q}</option>
            ))}
          </Select>
          <Select label="Frame rate" value={fps} onChange={(e) => onFps(e.target.value)}>
            {["24", "30", "60"].map((f) => (
              <option key={f} value={f}>{f} fps</option>
            ))}
          </Select>
        </div>
        <p className="mt-2 text-xs text-muted-text">
          {formatDuration(duration)} timeline · {clipCount} clip(s). This panel saves the exact render request with its settings.
        </p>
      </section>

      <section aria-label="Production health" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" aria-hidden="true" />
          Production health
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </h3>
        {issues.length === 0 ? (
          <p role="status" className="mt-2 text-sm text-muted-text">No known blocking issues. Every scene has visuals; narration has voice.</p>
        ) : (
          <ul className="mt-2 space-y-1.5" aria-label="Validation issues">
            {issues.map((issue, i) => (
              <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium">
                  {issue.scene ? `${issue.scene} — ` : ""}{issue.message}
                  <Badge tone={issue.severity === "block" ? "bad" : "warn"}>{issue.severity === "block" ? "Blocking" : "Review"}</Badge>
                </p>
                <p className="mt-0.5 text-muted-text"><span className="font-medium">Fix: </span>{issue.fix}</p>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-3" onClick={onSaveRequest} disabled={health === "blocked"} title={health === "blocked" ? "Resolve blocking issues first" : "Save the exact render request"}>
          <Download className="size-4" aria-hidden="true" />
          Save render request
        </Button>
        {health === "blocked" && (
          <p className="mt-1.5 text-xs text-muted-text">Blocked requests cannot be saved — fix the issues above. No percentages are shown because no render runs.</p>
        )}
      </section>

      {requests.length > 0 && (
        <section aria-label="Saved render requests" className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold">Saved requests ({requests.length})</h3>
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium">
                  {r.preset} · {r.settings.quality} · {r.settings.fps} fps
                  <Badge tone={r.health === "ready" ? "ok" : r.health === "review" ? "warn" : "bad"}>{r.health}</Badge>
                </p>
                <p className="text-xs text-muted-text">
                  {r.settings.width}×{r.settings.height} {r.settings.format} · {r.issues.length} noted issue(s) · saved {new Date(r.createdAt).toLocaleString()} · saved request.
                </p>
                <button type="button" onClick={() => onRemoveRequest(r.id)} className="mt-1 text-xs text-muted-text underline">
                  Discard request
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export { brandedTitleStyle };
