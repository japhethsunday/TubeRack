import { Play, Captions, AudioWaveform, Music, Zap } from "lucide-react";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";

const SCENES = [
  { id: "s1", label: "Hook", duration: "0:00–0:18", active: true },
  { id: "s2", label: "Stakes", duration: "0:18–0:45", active: false },
  { id: "s3", label: "Payoff I", duration: "0:45–1:30", active: false },
  { id: "s4", label: "Loop", duration: "1:30–2:10", active: false },
  { id: "s5", label: "CTA", duration: "2:10–2:30", active: false },
];

const TRACKS = [
  { id: "voice", label: "Voice", icon: AudioWaveform, clips: ["Narration v1 (preview)"] },
  { id: "music", label: "Music", icon: Music, clips: ["Bed — ambient (preview)"] },
  { id: "sfx", label: "SFX", icon: Zap, clips: ["Whoosh @ 0:18 (preview)"] },
  { id: "captions", label: "Captions", icon: Captions, clips: ["EN auto (preview)"] },
];

/**
 * Video editor visual foundation: preview / scene timeline / audio tracks.
 * Static layout only — timeline interaction + rendering arrive Phase 8 + 11.
 * On small screens the regions stack (specialized mobile layout).
 */
export function EditorLayout() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Video editor</h3>
        <Badge tone="preview">Layout preview</Badge>
      </div>

      {/* Preview */}
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <div className="flex aspect-video flex-col items-center justify-center gap-2 text-white">
          <button
            type="button"
            aria-label="Play preview (disabled in design preview)"
            disabled
            className="flex size-12 items-center justify-center rounded-full bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Play className="size-5 fill-current" aria-hidden="true" />
          </button>
          <p className="text-xs text-white/80">Scene 1 — Hook · 0:00 / 2:30</p>
          <p className="rounded bg-black/60 px-2 py-1 text-sm font-medium">
            “Sample caption line (preview)”
          </p>
        </div>
      </div>

      {/* Scene / timeline strip */}
      <div>
        <p className="text-xs font-medium text-muted-text" id="scene-strip-label">
          Scenes
        </p>
        <ol
          aria-labelledby="scene-strip-label"
          className="mt-2 flex gap-2 overflow-x-auto pb-1"
        >
          {SCENES.map((s) => (
            <li
              key={s.id}
              aria-current={s.active ? "true" : undefined}
              className={
                s.active
                  ? "w-36 shrink-0 rounded-lg border border-primary bg-surface p-3"
                  : "w-36 shrink-0 rounded-lg border border-border bg-surface p-3"
              }
            >
              <p className="text-xs font-medium">{s.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-text">{s.duration}</p>
              <div aria-hidden="true" className="mt-2 h-8 rounded bg-muted" />
            </li>
          ))}
        </ol>
      </div>

      {/* Tracks */}
      <div>
        <p className="text-xs font-medium text-muted-text" id="tracks-label">
          Voice · Music · SFX · Captions
        </p>
        <ul aria-labelledby="tracks-label" className="mt-2 space-y-2">
          {TRACKS.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2"
            >
              <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs font-medium">
                <t.icon className="size-3.5 text-muted-text" aria-hidden="true" />
                {t.label}
              </span>
              <div className="flex flex-1 gap-1 overflow-hidden">
                {t.clips.map((c) => (
                  <span
                    key={c}
                    className="truncate rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-text"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Alert tone="info" title="Rendering arrives in Phase 8 + 11">
        The timeline, playback, and FFmpeg render pipeline connect here later.
        Failed renders will be retryable per scene without starting over.
      </Alert>
    </div>
  );
}
