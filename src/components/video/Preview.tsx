"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize, Volume2, VolumeX, AudioLines } from "lucide-react";
import type { SceneSegment } from "@/src/lib/video/build";
import { clipsAt, sceneAt } from "@/src/lib/video/build";
import type { Composition } from "@/src/lib/video/types";
import { renderMusic, renderSfx, musicRecipe, speakText, stopSpeech, type MusicMood, type SfxType } from "@/src/lib/media/audio";
import { stopAllPlayback, claimPlayback } from "@/src/components/media/players";
import { cx } from "@/src/components/ui/cx";

interface AssetLookup {
  kind: string;
  source: string;
  payload: string;
  mime: string;
  title: string;
}

const MOTION_CLASS: Record<string, string> = {
  "kenburns": "anim-kb",
  "zoom-in": "anim-zoom-in",
  "zoom-out": "anim-zoom-out",
  "pan-left": "anim-pan-left",
  "pan-right": "anim-pan-right",
  "pan-up": "anim-pan-up",
  "pan-down": "anim-pan-down",
};

/**
 * Live composition preview: scene visuals (drafts/uploads/slates), Ken Burns
 * motion, text overlays, captions, and synced voice/music/sfx. Everything on
 * screen and in the speakers derives from actual editor state — never a mock.
 */
export function Preview({
  comp,
  segments,
  duration,
  playhead,
  onPlayhead,
  scenes,
  assetFor,
  blobFor,
  onPlayingChange,
}: {
  comp: Composition;
  segments: SceneSegment[];
  duration: number;
  playhead: number;
  onPlayhead: (t: number) => void;
  scenes: { id: string; title: string; number: number }[];
  assetFor: (assetId: string | undefined) => AssetLookup | null;
  blobFor: (assetId: string | undefined) => string | null;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [masterMuted, setMasterMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const frame = useRef(0);
  const lastTick = useRef(0);
  const spokenRef = useRef<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<{ assetId: string; stop: () => void } | null>(null);
  const sfxFired = useRef(new Set<string>());
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stateRef = useRef({ playhead, comp, segments, duration, speed, masterMuted, audioEnabled, assetFor, blobFor });
  const playingRef = useRef(playing);

  // Latest-values mirror for the rAF loop and audio sync (effect, not render).
  useEffect(() => {
    stateRef.current = { playhead, comp, segments, duration, speed, masterMuted, audioEnabled, assetFor, blobFor };
    playingRef.current = playing;
  });

  const hiddenTracks = new Set(comp.tracks.filter((t) => t.hidden).map((t) => t.id));
  const atTime = clipsAt(comp.clips, playhead);
  const segment = sceneAt(segments, playhead);
  const visual = atTime.find((c) => (c.kind === "image" || c.kind === "video") && !hiddenTracks.has(c.trackId));
  const texts = atTime.filter((c) => c.kind === "text" && !hiddenTracks.has(c.trackId));
  const caption = [...atTime.filter((c) => c.kind === "captions" && !hiddenTracks.has(c.trackId))].pop();
  const visualAsset = visual?.assetId ? assetFor(visual.assetId) : null;
  const visualBlob = visual?.assetId
    ? visualAsset?.source === "provider-output"
      ? visualAsset.payload
      : blobFor(visual.assetId)
    : null;

  function setPlayingState(next: boolean) {
    setPlaying(next);
    onPlayingChange?.(next);
  }

  function stopAudio() {
    stopSpeech();
    voiceAudioRef.current?.pause();
    voiceAudioRef.current = null;
    musicRef.current?.stop();
    musicRef.current = null;
    spokenRef.current = null;
    sfxFired.current.clear();
  }

  /** Keep the speakers in sync with the timeline. Real assets only. */
  function syncAudio(t: number) {
    const s = stateRef.current;
    if (s.masterMuted || !s.audioEnabled) {
      stopAudio();
      return;
    }
    const audible = (trackKind: string) => {
      const track = s.comp.tracks.find((tr) => tr.kind === trackKind);
      return track && !track.muted;
    };
    const active = s.comp.clips.filter((c) => t >= c.startSec && t < c.startSec + c.durationSec && !c.muted);

    const voice = audible("voice") ? active.find((c) => c.kind === "voice") : undefined;
    const voiceKey = voice ? `${voice.id}@${voice.startSec}` : null;
    if (voiceKey !== spokenRef.current) {
      stopSpeech();
      spokenRef.current = voiceKey;
      voiceAudioRef.current?.pause();
      voiceAudioRef.current = null;
      const payload = voice?.assetId ? s.assetFor(voice.assetId) : null;
      if (voice && payload?.source === "provider-output") {
        const audio = new Audio(payload.payload);
        audio.volume = Math.min(1, Math.max(0, voice.volume));
        audio.currentTime = Math.max(0, t - voice.startSec);
        voiceAudioRef.current = audio;
        void audio.play().catch(() => {});
      } else try {
        const params = payload ? (JSON.parse(payload.payload) as { text?: string; voiceName?: string; rate?: number; pitch?: number; lang?: string }) : null;
        if (voice && params?.text) {
          const release = claimPlayback(() => stopSpeech());
          void release;
          speakText(params.text, { voiceName: params.voiceName, rate: params.rate ?? 1, pitch: params.pitch ?? 1, lang: params.lang ?? "en-US" });
        }
      } catch {
        // Unreadable take — preview continues silently.
      }
    }

    const music = audible("music") ? active.find((c) => c.kind === "music") : undefined;
    if ((music?.assetId ?? null) !== (musicRef.current?.assetId ?? null)) {
      musicRef.current?.stop();
      musicRef.current = null;
      if (music?.assetId) {
        try {
          const payload = s.assetFor(music.assetId);
          const recipe = payload ? (JSON.parse(payload.payload) as { mood: MusicMood; seconds: number }) : null;
          if (recipe?.mood) {
            const { buffer, context } = renderMusic(musicRecipe(recipe.mood, recipe.seconds));
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const gain = context.createGain();
            gain.gain.value = music.volume * 0.8;
            source.connect(gain).connect(context.destination);
            source.start();
            const release = claimPlayback(() => {
              try { source.stop(); } catch { /* stopped */ }
              void context.close();
            });
            musicRef.current = {
              assetId: music.assetId,
              stop: () => {
                release();
                try { source.stop(); } catch { /* stopped */ }
                void context.close();
              },
            };
          }
        } catch {
          // Render failure — preview continues without music.
        }
      }
    }

    if (audible("sfx")) {
      for (const clip of active.filter((c) => c.kind === "sfx")) {
        const key = `${clip.id}@${clip.startSec}`;
        if (sfxFired.current.has(key)) continue;
        sfxFired.current.add(key);
        try {
          const payload = clip.assetId ? s.assetFor(clip.assetId) : null;
          const recipe = payload ? (JSON.parse(payload.payload) as { type: SfxType }) : null;
          if (recipe?.type) {
            const { buffer, context } = renderSfx({ type: recipe.type, seconds: 3 });
            const source = context.createBufferSource();
            source.buffer = buffer;
            const gain = context.createGain();
            gain.gain.value = clip.volume;
            source.connect(gain).connect(context.destination);
            source.onended = () => void context.close();
            source.start();
          }
        } catch {
          // Preview continues without the effect.
        }
      }
    }
  }

  useEffect(() => () => {
    window.cancelAnimationFrame(frame.current);
    stopAudio();
    stopAllPlayback();
  }, []);

  useEffect(() => {
    if (!playing) {
      window.cancelAnimationFrame(frame.current);
      stopAudio();
      videoRef.current?.pause();
      return;
    }
    lastTick.current = performance.now();
    const loop = (now: number) => {
      const s = stateRef.current;
      const dt = ((now - lastTick.current) / 1000) * s.speed;
      lastTick.current = now;
      const next = s.playhead + dt;
      if (next >= s.duration || s.duration <= 0) {
        onPlayhead(s.duration);
        setPlayingState(false);
        stopAudio();
        return;
      }
      onPlayhead(Math.round(next * 10) / 10);
      syncAudio(next);
      frame.current = window.requestAnimationFrame(loop);
    };
    frame.current = window.requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Keep upload-video elements roughly in sync (best effort, muted preview).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !visual || visual.kind !== "video") return;
    const offset = Math.max(0, playhead - visual.startSec);
    if (Math.abs(el.currentTime - offset) > 0.4) {
      try { el.currentTime = offset; } catch { /* not ready */ }
    }
    if (playing) void el.play().catch(() => {});
    else el.pause();
  });

  const sceneTitle = segment ? `Scene ${segment.number}: ${segment.title}` : "No scene";
  const aspectStyle = comp.canvas.aspect === "9:16" ? "aspect-[9/16]" : comp.canvas.aspect === "1:1" ? "aspect-square" : "aspect-video";

  return (
    <section aria-label="Preview" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-semibold">Preview</p>
        <span className="truncate text-xs text-muted-text" aria-live="polite">{sceneTitle}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAudioEnabled((a) => !a)}
            aria-pressed={audioEnabled}
            title="Preview scene audio"
            aria-label="Toggle preview audio"
            className={cx("rounded-md p-1.5", audioEnabled ? "bg-muted text-foreground" : "text-muted-text hover:bg-muted")}
          >
            <AudioLines className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => boxRef.current?.requestFullscreen?.().catch(() => {})}
            aria-label="Fullscreen preview"
            className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground"
          >
            <Maximize className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div ref={boxRef} className="bg-black p-3">
        <div className={cx("relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg bg-zinc-900", aspectStyle)} aria-label={`Preview canvas: ${sceneTitle}`}>
          {visual && visualAsset ? (
            visual.kind === "image" && visualAsset.source === "local-draft" ? (
              <div key={`${visual.id}@${visual.startSec}`} className={cx("absolute inset-0", MOTION_CLASS[visual.motion ?? ""] ?? "")} dangerouslySetInnerHTML={{ __html: visualAsset.payload }} />
            ) : visualBlob ? (
              visual.kind === "video" ? (
                <video ref={videoRef} src={visualBlob} muted playsInline preload="auto" className="absolute inset-0 h-full w-full object-contain" aria-label={visual.name} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- session blob URL; the optimizer cannot process object URLs.
                <img src={visualBlob} alt={visual.name} className="absolute inset-0 h-full w-full object-contain" />
              )
            ) : (
              <Slate title={segment ? `Scene ${segment.number}` : "—"} subtitle="Source file unavailable this session" />
            )
          ) : (
            <Slate title={segment ? `Scene ${segment.number}: ${segment.title}` : "Empty timeline"} subtitle={segment ? "No visual assigned — see export validation" : "Add scenes to begin"} />
          )}

          {texts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "absolute left-0 right-0 px-4",
                t.style?.position === "top" ? "top-4" : t.style?.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-16",
              )}
              style={{
                textAlign: t.style?.align ?? "center",
                opacity: t.style?.opacity ?? 1,
              }}
            >
              <span
                style={{
                  fontFamily: t.style?.font,
                  fontSize: `${Math.max(12, (t.style?.size ?? 32) / 2.4)}px`,
                  fontWeight: t.style?.weight ?? 600,
                  color: t.style?.color ?? "#fff",
                  background: t.style?.background ?? "rgba(0,0,0,0.55)",
                  padding: "0.15em 0.5em",
                  borderRadius: "0.3em",
                }}
              >
                {t.text}
              </span>
            </div>
          ))}

          {caption?.text && (
            <div className="absolute bottom-4 left-0 right-0 px-6 text-center" aria-live="polite">
              <span className="rounded bg-black/70 px-3 py-1 text-sm font-medium text-white">{caption.text}</span>
            </div>
          )}
        </div>

        <div className="mx-auto mt-2 flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (playing) {
                setPlayingState(false);
                stopAudio();
              } else {
                if (playhead >= duration) onPlayhead(0);
                sfxFired.current.clear();
                setPlayingState(true);
              }
            }}
            aria-label={playing ? "Pause preview" : "Play preview"}
            aria-pressed={playing}
            className="flex size-9 items-center justify-center rounded-lg bg-white text-black hover:opacity-90"
          >
            {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          </button>
          <label className="sr-only" htmlFor="preview-seek">Seek</label>
          <input
            id="preview-seek"
            type="range"
            min={0}
            max={Math.max(0.1, duration)}
            step={0.1}
            value={Math.min(playhead, duration)}
            onChange={(e) => {
              onPlayhead(Number(e.target.value));
              spokenRef.current = null;
            }}
            className="min-w-0 flex-1"
          />
          <span className="shrink-0 text-xs tabular-nums text-zinc-300">
            {playhead.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-1 text-xs text-white">
            {[0.5, 1, 1.5, 2].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setMasterMuted((m) => !m);
              if (!masterMuted) stopAudio();
            }}
            aria-label={masterMuted ? "Unmute preview" : "Mute preview"}
            aria-pressed={!masterMuted}
            className="rounded-md p-1.5 text-zinc-300 hover:bg-zinc-800"
          >
            {masterMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
}

function Slate({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-lg font-semibold text-zinc-200">{title}</p>
      <p className="max-w-sm text-xs text-zinc-400">{subtitle}</p>
    </div>
  );
}
