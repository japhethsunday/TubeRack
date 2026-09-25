"use client";

import { sceneSpeech } from "@/src/lib/script/engine";
import { ArrowUp, ArrowDown, Trash2, RefreshCw, Clapperboard } from "lucide-react";
import type { Scene, ShotType } from "@/src/lib/script/types";
import { formatDuration } from "@/src/lib/script/measure";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const SHOTS: (ShotType | "")[] = ["", "Talking head", "Screen capture", "B-roll", "Animation", "Text on screen", "Interview", "Archival"];

/** One production scene: script, visual direction, timing, assets, notes. */
export function SceneCard({
  scene,
  index,
  total,
  needsReview,
  onPatch,
  onMove,
  onDelete,
  onSync,
}: {
  scene: Scene;
  index: number;
  total: number;
  needsReview: boolean;
  onPatch: (patch: Partial<Scene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onSync: () => void;
}) {
  return (
    <article
      aria-label={`Scene ${scene.number}: ${scene.title}`}
      id={`scene-${scene.id}`}
      className={cx("rounded-xl border bg-surface p-4", needsReview ? "border-warning/50" : "border-border")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
            {scene.number}
          </span>
          <label className="sr-only" htmlFor={`title-${scene.id}`}>Scene title</label>
          <input
            id={`title-${scene.id}`}
            value={scene.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            aria-label="Scene title"
            className="w-48 rounded-md bg-transparent px-1 py-0.5 hover:bg-muted focus:bg-muted"
          />
          {needsReview ? <Badge tone="warn">Script changed — review</Badge> : <Badge tone="ok">In sync</Badge>}
        </h3>
        <p className="flex items-center gap-2 text-xs text-muted-text">
          <Clapperboard className="size-3.5" aria-hidden="true" />
          ~{formatDuration(scene.durationSec)}
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-text">Script</p>
          <p className="mt-1 line-clamp-4 leading-relaxed">{scene.scriptText || <span className="text-muted-text">(empty)</span>}</p>
        </div>
        <Textarea
          label="Visual direction"
          rows={3}
          value={scene.visual}
          onChange={(e) => onPatch({ visual: e.target.value })}
          placeholder="What the viewer sees…"
        />
        <Textarea
          label="Narration"
          rows={4}
          value={sceneSpeech(scene)}
          onChange={(e) => onPatch({ narration: e.target.value })}
          placeholder="Voiceover for this scene…"
        />
        <div className="grid gap-3">
          <Input label="On-screen text" value={scene.onScreenText} onChange={(e) => onPatch({ onScreenText: e.target.value })} placeholder="Lower thirds, titles…" />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Shot" value={scene.shot} onChange={(e) => onPatch({ shot: e.target.value as Scene["shot"] })}>
              {SHOTS.map((s) => (
                <option key={s} value={s}>{s || "Select…"}</option>
              ))}
            </Select>
            <Input label="Transition" value={scene.transition} onChange={(e) => onPatch({ transition: e.target.value })} placeholder="Cut, dissolve…" />
          </div>
        </div>
        <Textarea
          label="B-roll direction"
          rows={2}
          value={scene.broll}
          onChange={(e) => onPatch({ broll: e.target.value })}
          placeholder="Coverage to cut away to…"
        />
        <div>
          <Input
            label="Assets needed (comma-separated)"
            value={scene.assetsNeeded.join(", ")}
            onChange={(e) => onPatch({ assetsNeeded: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) })}
            placeholder="hero-still.png, drone-clip.mp4"
          />
          <div className="mt-2">
            <Textarea
              label="Scene notes (private — never rendered)"
              rows={2}
              value={scene.notes}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder="Private direction…"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1" role="toolbar" aria-label={`Scene ${scene.number} tools`}>
        <ToolButton label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)} icon={<ArrowUp className="size-3.5" />} />
        <ToolButton label="Move later" disabled={index === total - 1} onClick={() => onMove(1)} icon={<ArrowDown className="size-3.5" />} />
        {needsReview && (
          <ToolButton label="Re-sync from script" onClick={onSync} icon={<RefreshCw className="size-3.5" />} />
        )}
        <ToolButton label="Delete scene" danger onClick={onDelete} icon={<Trash2 className="size-3.5" />} />
      </div>
    </article>
  );
}

function ToolButton({ label, icon, onClick, disabled, danger }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150",
        danger ? "text-destructive hover:bg-destructive/10" : "text-muted-text hover:bg-muted hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
