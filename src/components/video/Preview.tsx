"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize, Volume2, VolumeX, SkipBack, SkipForward, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type { SceneSegment } from "@/src/lib/video/build";
import { sceneAt } from "@/src/lib/video/build";
import type { Composition, TimelineClip } from "@/src/lib/video/types";
import { drawComposition, sourceTime, transitionState } from "@/src/lib/video/compositor";
import { assetUrl, loadImage, type RenderAsset } from "@/src/lib/video/render";
import { renderMusic, renderSfx, musicRecipe, speakText, stopSpeech, type MusicMood, type SfxType } from "@/src/lib/media/audio";
import { stopAllPlayback, claimPlayback } from "@/src/components/media/players";
import { cx } from "@/src/components/ui/cx";

export function fmtTimecode(sec: number, fps = 30): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const f = Math.floor((s - Math.floor(s)) * fps);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

/**
 * Live preview: every frame is drawn by the same compositor the exporter
 * uses (layers, transforms, crop, filters, transitions, animated text,
 * captions), so the preview is exactly what gets exported. Audio plays in
 * sync: voice, music, SFX, and the original sound of video clips.
 */
export function Preview({
  comp,
  segments,
  duration,
  playhead,
  onPlayhead,
  assetFor,
  fps = 30,
  onPlayingChange,
  selectedId,
}: {
  comp: Composition;
  segments: SceneSegment[];
  duration: number;
  playhead: number;
  onPlayhead: (t: number) => void;
  assetFor: (assetId: string | undefined) => RenderAsset | null;
  fps?: number;
  onPlayingChange?: (playing: boolean) => void;
  selectedId?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const lastTick = useRef(0);
  const images = useRef(new Map<string, HTMLImageElement | "loading" | "failed">());
  const videos = useRef(new Map<string, { el: HTMLVideoElement; url: string }>());
  const [, setLoadTick] = useState(0);
  const spokenRef = useRef<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<{ key: string; stop: () => void } | null>(null);
  const sfxFired = useRef(new Set<string>());
  const state = useRef({ comp, duration, playhead, masterMuted, volume, loop, assetFor, selectedId });
  useEffect(() => {
    state.current = { comp, duration, playhead, masterMuted, volume, loop, assetFor, selectedId };
  });

  const W = comp.canvas.width || 1920;
  const H = comp.canvas.height || 1080;
  // Preview renders at up to 1280px wide for smooth playback; export uses full size.
  const scale = Math.min(1, 1280 / W);
  const PW = Math.round(W * scale);
  const PH = Math.round(H * scale);

  // ---- Media element pool: images per asset, one <video> per clip. ----
  function ensureMedia(clip: TimelineClip) {
    const a = state.current.assetFor(clip.assetId);
    if (clip.kind === "image" && clip.assetId && !images.current.has(clip.assetId)) {
      const url = assetUrl(a, "image");
      if (!url) return;
      images.current.set(clip.assetId, "loading");
      loadImage(url)
        .then((img) => images.current.set(clip.assetId!, img))
        .catch(() => images.current.set(clip.assetId!, "failed"))
        .finally(() => setLoadTick((n) => n + 1));
    }
    if (clip.kind === "video") {
      const url = assetUrl(a, "video");
      const cur = videos.current.get(clip.id);
      if (!url || cur?.url === url) return;
      cur?.el.pause();
      const el = document.createElement("video");
      el.crossOrigin = "anonymous";
      el.playsInline = true;
      el.preload = "auto";
      el.src = url;
      el.onloadeddata = () => setLoadTick((n) => n + 1);
      el.onseeked = () => !playingRef.current && draw(state.current.playhead);
      videos.current.set(clip.id, { el, url });
    }
  }

  const playingRef = useRef(false);

  function draw(t: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const s = state.current;
    drawComposition(ctx, s.comp, t, canvas.width, canvas.height, {
      sourceFor: (c) => {
        if (c.kind === "video") {
          const v = videos.current.get(c.id)?.el;
          return v && v.readyState >= 2 ? v : null;
        }
        const img = c.assetId ? images.current.get(c.assetId) : undefined;
        return img instanceof HTMLImageElement ? img : null;
      },
      isDraft: (c) => s.assetFor(c.assetId)?.source === "local-draft",
    });
    // Selection outline (preview only).
    const sel = s.comp.clips.find((c) => c.id === s.selectedId && t >= c.startSec && t < c.startSec + c.durationSec);
    if (sel && (sel.kind === "video" || sel.kind === "image")) {
      ctx.save();
      ctx.strokeStyle = "rgba(167,139,250,0.9)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      ctx.restore();
    }
  }

  function syncVideos(t: number, isPlaying: boolean) {
    const s = state.current;
    const mutedTracks = new Set(s.comp.tracks.filter((tr) => tr.muted).map((tr) => tr.id));
    const hidden = new Set(s.comp.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
    for (const clip of s.comp.clips) if (clip.kind === "video" && !hidden.has(clip.trackId)) ensureMedia(clip);
    for (const clip of s.comp.clips) if (clip.kind === "image" && !hidden.has(clip.trackId)) ensureMedia(clip);
    for (const [clipId, { el }] of videos.current) {
      const clip = s.comp.clips.find((c) => c.id === clipId);
      if (!clip) {
        el.pause();
        videos.current.delete(clipId);
        continue;
      }
      const active = t >= clip.startSec && t < clip.startSec + clip.durationSec && !hidden.has(clip.trackId);
      if (!active) {
        if (!el.paused) el.pause();
        continue;
      }
      const want = sourceTime(clip, t, Number.isFinite(el.duration) ? el.duration : undefined);
      const audible = !s.masterMuted && !clip.muted && !mutedTracks.has(clip.trackId) && !clip.reverse;
      el.muted = !audible;
      el.volume = Math.max(0, Math.min(1, clip.volume * s.volume * transitionState(clip, t).alpha));
      if (!isPlaying || clip.reverse) {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.03) el.currentTime = want;
      } else {
        el.playbackRate = Math.min(4, Math.max(0.25, clip.speed ?? 1));
        if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want;
        if (el.paused) void el.play().catch(() => {});
      }
    }
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

  /** Voice, music, and SFX in sync with the playhead. */
  function syncAudio(t: number) {
    const s = state.current;
    if (s.masterMuted) {
      stopAudio();
      return;
    }
    const mutedTracks = new Set(s.comp.tracks.filter((tr) => tr.muted).map((tr) => tr.id));
    const active = s.comp.clips.filter((c) => t >= c.startSec && t < c.startSec + c.durationSec && !c.muted && !mutedTracks.has(c.trackId));

    const voice = active.find((c) => c.kind === "voice");
    const voiceKey = voice ? `${voice.id}@${voice.startSec}` : null;
    if (voiceKey !== spokenRef.current) {
      stopSpeech();
      spokenRef.current = voiceKey;
      voiceAudioRef.current?.pause();
      voiceAudioRef.current = null;
      const a = voice ? s.assetFor(voice.assetId) : null;
      const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
      if (voice && url) {
        const audio = new Audio(url);
        audio.volume = Math.min(1, Math.max(0, voice.volume * s.volume));
        audio.playbackRate = voice.speed ?? 1;
        audio.currentTime = sourceTime(voice, t);
        voiceAudioRef.current = audio;
        void audio.play().catch(() => {});
      } else if (voice && a) {
        try {
          const params = JSON.parse(a.payload) as { text?: string; voiceName?: string; rate?: number; pitch?: number; lang?: string };
          if (params.text) {
            claimPlayback(() => stopSpeech());
            speakText(params.text, { voiceName: params.voiceName, rate: params.rate ?? 1, pitch: params.pitch ?? 1, lang: params.lang ?? "en-US" });
          }
        } catch {
          // Unreadable take — preview continues silently.
        }
      }
    }

    const music = active.find((c) => c.kind === "music");
    const musicKey = music ? `${music.id}@${music.startSec}` : null;
    if (musicKey !== (musicRef.current?.key ?? null)) {
      musicRef.current?.stop();
      musicRef.current = null;
      if (music) {
        const a = s.assetFor(music.assetId);
        const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
        if (url) {
          const audio = new Audio(url);
          audio.loop = true;
          audio.volume = Math.min(1, Math.max(0, music.volume * 0.8 * s.volume));
          audio.playbackRate = music.speed ?? 1;
          audio.currentTime = sourceTime(music, t);
          void audio.play().catch(() => {});
          musicRef.current = { key: musicKey!, stop: () => audio.pause() };
        } else if (a) {
          try {
            const recipe = JSON.parse(a.payload) as { mood: MusicMood; seconds: number };
            if (recipe?.mood) {
              const { buffer, context } = renderMusic(musicRecipe(recipe.mood, recipe.seconds));
              const source = context.createBufferSource();
              source.buffer = buffer;
              source.loop = true;
              const gain = context.createGain();
              gain.gain.value = music.volume * 0.8 * s.volume;
              source.connect(gain).connect(context.destination);
              source.start();
              const stop = () => {
                try {
                  source.stop();
                } catch {
                  // already stopped
                }
              };
              const release = claimPlayback(stop);
              musicRef.current = { key: musicKey!, stop: () => (release(), stop()) };
            }
          } catch {
            // Preview continues without music.
          }
        }
      }
    }

    for (const clip of active.filter((c) => c.kind === "sfx")) {
      const key = `${clip.id}@${clip.startSec}`;
      if (sfxFired.current.has(key)) continue;
      sfxFired.current.add(key);
      const a = s.assetFor(clip.assetId);
      const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
      if (url) {
        const audio = new Audio(url);
        audio.volume = Math.min(1, clip.volume * s.volume);
        void audio.play().catch(() => {});
      } else if (a) {
        try {
          const recipe = JSON.parse(a.payload) as { type: SfxType };
          if (recipe?.type) {
            const { buffer, context } = renderSfx({ type: recipe.type, seconds: 3 });
            const source = context.createBufferSource();
            source.buffer = buffer;
            const gain = context.createGain();
            gain.gain.value = clip.volume * s.volume;
            source.connect(gain).connect(context.destination);
            source.start();
          }
        } catch {
          // Preview continues without the effect.
        }
      }
    }
  }

  function setPlayingState(next: boolean) {
    playingRef.current = next;
    setPlaying(next);
    onPlayingChange?.(next);
  }

  function toggle() {
    if (playingRef.current) {
      setPlayingState(false);
      stopAudio();
      syncVideos(state.current.playhead, false);
    } else {
      if (state.current.playhead >= state.current.duration - 0.05) onPlayhead(0);
      sfxFired.current.clear();
      setPlayingState(true);
    }
  }

  // Play loop.
  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    let t = state.current.playhead;
    const tick = (now: number) => {
      const s = state.current;
      t += (now - lastTick.current) / 1000;
      lastTick.current = now;
      if (t >= s.duration) {
        if (s.loop) {
          t = 0;
          stopAudio();
        } else {
          onPlayhead(s.duration);
          setPlayingState(false);
          stopAudio();
          syncVideos(s.duration, false);
          return;
        }
      }
      syncVideos(t, true);
      syncAudio(t);
      draw(t);
      onPlayhead(Math.round(t * 1000) / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Paused: redraw on every edit or seek.
  useEffect(() => {
    if (playingRef.current) return;
    syncVideos(playhead, false);
    draw(playhead);
  });

  // Keyboard: space play/pause, ←/→ frame step, J/K/L, Home/End.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], [role=slider], [role=option]")) return;
      const s = state.current;
      const step = 1 / fps;
      if (e.code === "Space" || e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "," || (e.key === "ArrowLeft" && !e.shiftKey && !e.altKey)) {
        e.preventDefault();
        if (playingRef.current) toggle();
        onPlayhead(Math.max(0, s.playhead - step));
      } else if (e.key === "." || (e.key === "ArrowRight" && !e.shiftKey && !e.altKey)) {
        e.preventDefault();
        if (playingRef.current) toggle();
        onPlayhead(Math.min(s.duration, s.playhead + step));
      } else if (e.key.toLowerCase() === "j") onPlayhead(Math.max(0, s.playhead - 5));
      else if (e.key.toLowerCase() === "l") onPlayhead(Math.min(s.duration, s.playhead + 5));
      else if (e.key === "Home") onPlayhead(0);
      else if (e.key === "End") onPlayhead(s.duration);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fps]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      stopAudio();
      stopAllPlayback();
      for (const { el } of videos.current.values()) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const segment = sceneAt(segments, playhead);
  const empty = comp.clips.length === 0;

  return (
    <section aria-label="Preview" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={boxRef} className="bg-black">
        <div className="relative flex items-center justify-center p-2 sm:p-3">
          <canvas
            ref={canvasRef}
            width={PW}
            height={PH}
            onClick={toggle}
            className="max-h-[62vh] w-full max-w-full cursor-pointer rounded-md bg-zinc-950 object-contain shadow-2xl"
            style={{ aspectRatio: `${W} / ${H}` }}
            aria-label={`Preview frame at ${fmtTimecode(playhead, fps)}${segment ? `, scene ${segment.number}` : ""}`}
            role="img"
          />
          {empty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Import a video or add clips to start editing</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800 px-3 py-2 text-zinc-200">
          <button type="button" onClick={() => onPlayhead(0)} aria-label="Go to start" className="rounded-md p-1.5 hover:bg-zinc-800"><SkipBack className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => onPlayhead(Math.max(0, playhead - 1 / fps))} aria-label="Previous frame" className="rounded-md p-1.5 hover:bg-zinc-800"><ChevronLeft className="size-4" aria-hidden="true" /></button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause (Space)" : "Play (Space)"}
            aria-pressed={playing}
            className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
          >
            {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4 translate-x-px" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => onPlayhead(Math.min(duration, playhead + 1 / fps))} aria-label="Next frame" className="rounded-md p-1.5 hover:bg-zinc-800"><ChevronRight className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => onPlayhead(duration)} aria-label="Go to end" className="rounded-md p-1.5 hover:bg-zinc-800"><SkipForward className="size-4" aria-hidden="true" /></button>
          <span className="ml-1 font-mono text-xs tabular-nums text-zinc-300" aria-live="off">
            {fmtTimecode(playhead, fps)} <span className="text-zinc-500">/ {fmtTimecode(duration, fps)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, duration)}
            step={1 / fps}
            value={Math.min(playhead, duration)}
            onChange={(e) => {
              onPlayhead(Number(e.target.value));
              spokenRef.current = null;
            }}
            aria-label="Seek"
            className="mx-2 min-w-24 flex-1 accent-violet-500"
          />
          <button type="button" onClick={() => setLoop((l) => !l)} aria-pressed={loop} aria-label="Loop playback" className={cx("rounded-md p-1.5 hover:bg-zinc-800", loop && "text-violet-400")}>
            <Repeat className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMasterMuted((m) => !m);
              if (!masterMuted) stopAudio();
            }}
            aria-label={masterMuted ? "Unmute" : "Mute"}
            aria-pressed={masterMuted}
            className="rounded-md p-1.5 hover:bg-zinc-800"
          >
            {masterMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Preview volume" className="w-20 accent-violet-500" />
          <button type="button" onClick={() => boxRef.current?.requestFullscreen?.().catch(() => {})} aria-label="Fullscreen" className="rounded-md p-1.5 hover:bg-zinc-800">
            <Maximize className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
