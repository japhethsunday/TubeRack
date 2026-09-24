"use client";

import { useRef, useState } from "react";
import { Music, AudioLines } from "lucide-react";
import { providerById, capabilityBlock, PROVIDERS } from "@/src/lib/media/providers";
import {
  MUSIC_MOODS,
  musicRecipe,
  renderMusic,
  renderSfx,
  SFX_TYPES,
  sfxRecipe,
  type MusicMood,
  type SfxType,
} from "@/src/lib/media/audio";
import { useMedia, runLocalJob, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { BufferPreview } from "@/src/components/media/players";
import { Select, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Alert } from "@/src/components/ui/Alert";
import { EmptyState } from "@/src/components/ui/states";

/** Session-only render cache: buffers re-render on demand after reload. */
const bufferCache = new Map<string, { buffer: AudioBuffer; context: AudioContext }>();

function cacheKey(kind: string, payload: string): string {
  let h = 0;
  const s = `${kind}:${payload}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `buf_${Math.abs(h).toString(36)}`;
}

/**
 * Music + SFX studios: synthesized on-device drafts with render-on-demand
 * previews. Moods, energy, and durations are real parameters; recordings
 * arrive with providers in Phase 11.
 */
export function MusicStudio({
  projectId,
  registerRerun,
}: {
  projectId: string;
  registerRerun: (assetId: string, fn: () => void) => void;
}) {
  const { addAsset, updateAsset, assetsFor } = useMedia();
  const [provider, setProvider] = useState("on-device");
  const [mood, setMood] = useState<MusicMood>("Documentary");
  const [seconds, setSeconds] = useState("15");
  const [title, setTitle] = useState("");
  const [render, setRender] = useState<{ buffer: AudioBuffer; context: AudioContext } | null>(null);
  const [running, setRunning] = useState(false);

  const block = capabilityBlock(provider, "music");
  const tracks = assetsFor(projectId).filter((a) => a.kind === "music" && a.source === "local-draft");

  function renderNow() {
    try {
      const { buffer, context } = renderMusic(musicRecipe(mood, Number(seconds) || 15));
      setRender({ buffer, context });
      return { buffer, context };
    } catch {
      return null;
    }
  }

  function saveTrack() {
    if (block) return;
    const recipe = musicRecipe(mood, Number(seconds) || 15);
    const flag = { cancelled: false };
    setRunning(true);
    const asset = addAsset({
      projectId,
      sceneIds: [],
      kind: "music",
      source: "local-draft",
      status: "pending",
      title: title.trim() || `${mood} bed (${recipe.seconds}s)`,
      payload: JSON.stringify({ mood, seconds: recipe.seconds, bpm: recipe.bpm }),
      mime: "application/x-tuberack-music",
      durationSec: recipe.seconds,
      tags: ["music", mood.toLowerCase()],
      approval: "draft",
    });
    const rerun = () => saveTrack();
    registerRerun(asset.id, rerun);
    void runLocalJob(
      (status) => updateAsset(asset.id, { status }),
      [
        { label: "compose", work: () => undefined },
        {
          label: "render",
          work: () => {
            const out = renderNow();
            if (out) bufferCache.set(cacheKey("music", asset.payload), out);
          },
        },
      ],
      () => flag.cancelled,
    ).then((ok) => {
      updateAsset(asset.id, { status: ok ? "ready" : "cancelled" });
      setRunning(false);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.filter((p) => p.capabilities.music).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {block && <Alert tone="warn" title="Music provider not connected">{block}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Mood" value={mood} onChange={(e) => setMood(e.target.value as MusicMood)}>
            {MUSIC_MOODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Select label="Duration" value={seconds} onChange={(e) => setSeconds(e.target.value)}>
            {["8", "15", "30", "60"].map((d) => (
              <option key={d} value={d}>{d} seconds</option>
            ))}
          </Select>
        </div>
        <Input label="Track title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${mood} bed`} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => renderNow()} disabled={Boolean(block)}>
            Render preview
          </Button>
          <Button onClick={saveTrack} disabled={running || Boolean(block)}>
            <Music className="size-4" aria-hidden="true" />
            {running ? "Rendering…" : "Save track"}
          </Button>
        </div>
        <BufferPreview buffer={render?.buffer ?? null} context={render?.context ?? null} label="Music preview" />
        <p className="text-xs text-muted-text">Synthesized beds for planning and temp mixes — not licensed finals. Upload finished tracks in Uploads.</p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Tracks ({tracks.length})</h3>
        {tracks.length === 0 ? (
          <EmptyState title="No tracks yet" body="Render a mood, save the ones that fit, approve explicitly, assign to scenes from the Library." />
        ) : (
          <ul className="space-y-2" aria-label="Saved tracks">
            {tracks.slice(0, 8).map((t) => (
              <TrackRow key={t.id} assetId={t.id} payload={t.payload} title={t.title} recipeLabel={`${t.durationSec?.toFixed(0)}s`} />
            ))}
          </ul>
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}

function TrackRow({ assetId, payload, title, recipeLabel }: { assetId: string; payload: string; title: string; recipeLabel: string }) {
  const [render, setRender] = useState<{ buffer: AudioBuffer; context: AudioContext } | null>(
    () => bufferCache.get(cacheKey("music", payload)) ?? null,
  );
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center justify-between gap-2 text-sm font-medium">
        {title}
        <span className="text-xs font-normal text-muted-text">{recipeLabel}</span>
      </p>
      <div className="mt-2">
        {render ? (
          <BufferPreview buffer={render.buffer} context={render.context} label={title} />
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              try {
                const recipe = JSON.parse(payload) as { mood: MusicMood; seconds: number };
                const out = renderMusic(musicRecipe(recipe.mood, recipe.seconds));
                bufferCache.set(cacheKey("music", payload), out);
                setRender(out);
              } catch {
                // Stays unrestored; user can delete and re-render.
              }
            }}
          >
            Re-render preview
          </Button>
        )}
      </div>
    </li>
  );
}

export function SfxStudio({
  projectId,
  registerRerun,
}: {
  projectId: string;
  registerRerun: (assetId: string, fn: () => void) => void;
}) {
  const { addAsset, updateAsset, assetsFor } = useMedia();
  const [provider, setProvider] = useState("on-device");
  const [render, setRender] = useState<{ buffer: AudioBuffer; context: AudioContext } | null>(null);
  const [renderLabel, setRenderLabel] = useState("SFX preview");

  const block = capabilityBlock(provider, "sfx");
  const effects = assetsFor(projectId).filter((a) => a.kind === "sfx" && a.source === "local-draft");

  function preview(type: SfxType) {
    try {
      const out = renderSfx(sfxRecipe(type));
      setRender(out);
      setRenderLabel(`${type} preview`);
    } catch {
      setRender(null);
    }
  }

  function save(type: SfxType) {
    if (block) return;
    const recipe = sfxRecipe(type);
    const asset = addAsset({
      projectId,
      sceneIds: [],
      kind: "sfx",
      source: "local-draft",
      status: "pending",
      title: `${type} (synth)`,
      payload: JSON.stringify({ type, seconds: recipe.seconds }),
      mime: "application/x-tuberack-sfx",
      durationSec: recipe.seconds,
      tags: ["sfx", type.toLowerCase()],
      approval: "draft",
    });
    registerRerun(asset.id, () => save(type));
    updateAsset(asset.id, { status: "processing" });
    window.setTimeout(() => {
      try {
        const out = renderSfx(recipe);
        bufferCache.set(cacheKey("sfx", asset.payload), out);
        updateAsset(asset.id, { status: "ready" });
      } catch (e) {
        updateAsset(asset.id, { status: "failed", error: e instanceof Error ? e.message : "Render failed." });
      }
    }, 250);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.filter((p) => p.capabilities.sfx).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {block && <Alert tone="warn" title="SFX provider not connected">{block}</Alert>}
        <ul className="grid grid-cols-2 gap-2" aria-label="Sound effects">
          {SFX_TYPES.map((t) => (
            <li key={t} className="rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AudioLines className="size-4 text-muted-text" aria-hidden="true" />
                {t}
              </p>
              <p className="text-xs text-muted-text">{sfxRecipe(t).seconds.toFixed(1)}s synthesized</p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => preview(t)} disabled={Boolean(block)}>
                  Preview
                </Button>
                <Button size="sm" variant="outline" onClick={() => save(t)} disabled={Boolean(block)}>
                  Save
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <BufferPreview buffer={render?.buffer ?? null} context={render?.context ?? null} label={renderLabel} />
        <p className="text-xs text-muted-text">Placement happens on the Video Studio timeline — here effects are previewed, saved, and assigned to scenes.</p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Saved effects ({effects.length})</h3>
        {effects.length === 0 ? (
          <EmptyState title="No effects saved" body="Preview the eight synthesized effects, save the keepers, assign them to scenes." />
        ) : (
          <ul className="space-y-2" aria-label="Saved effects">
            {effects.slice(0, 10).map((e) => (
              <SfxRow key={e.id} payload={e.payload} title={e.title} />
            ))}
          </ul>
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}

function SfxRow({ payload, title }: { payload: string; title: string }) {
  const [render, setRender] = useState<{ buffer: AudioBuffer; context: AudioContext } | null>(
    () => bufferCache.get(cacheKey("sfx", payload)) ?? null,
  );
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2">
        {render ? (
          <BufferPreview buffer={render.buffer} context={render.context} label={title} />
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              try {
                const recipe = JSON.parse(payload) as { type: SfxType };
                const out = renderSfx(sfxRecipe(recipe.type));
                bufferCache.set(cacheKey("sfx", payload), out);
                setRender(out);
              } catch {
                // Stays unrestored; user can delete and re-save.
              }
            }}
          >
            Re-render preview
          </Button>
        )}
      </div>
    </li>
  );
}
