"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize, Volume2, VolumeX, SkipBack, SkipForward, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type { SceneSegment } from "@/src/lib/video/build";
import { sceneAt } from "@/src/lib/video/build";
import type { Composition, TimelineClip } from "@/src/lib/video/types";
import { drawComposition, sourceTime, transitionState } from "@/src/lib/video/compositor";
import { assetUrl, loadImage, type RenderAsset } from "@/src/lib/video/render";
import { mixGain } from "@/src/lib/video/mix";
import { sharedBlob } from "@/src/lib/video/media-cache";
import { renderMusic, renderSfx, musicRecipe, speakText, stopSpeech, unlockWebAudio, type MusicMood, type SfxType } from "@/src/lib/media/audio";
import { stopAllPlayback, claimPlayback } from "@/src/components/media/players";
import { cx } from "@/src/components/ui/cx";

/**
 * Audio longer than this streams in the preview rather than downloading whole:
 * a full download of a long voice take (a WAV is ~2.9 MB a minute) competes
 * with its own stream and keeps it silent on slower connections.
 */
const LONG_AUDIO_SEC = 2 * 60;

/** 0.1 s of silence: played inside the Play tap to unlock audio on phones. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRpIAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YW4AAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/**
 * Whole-file audio cache. Streaming a long WAV while seeking it makes the
 * browser stutter and crackle, so each track is downloaded once into memory
 * and played from there.
 */
const audioCache = new Map<string, Promise<string>>();
/** Files already downloaded in full (object URL ready now). */
const audioReady = new Map<string, string>();
function cachedAudio(url: string): Promise<string> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return Promise.resolve(url);
  let p = audioCache.get(url);
  if (!p) {
    p = sharedBlob(url)
      .then((b) => {
        const local = URL.createObjectURL(b);
        audioReady.set(url, local);
        return local;
      })
      .catch((e) => {
        audioCache.delete(url);
        throw e;
      });
    audioCache.set(url, p);
  }
  return p;
}

/** Starts a cached audio file at the playhead once its data is ready; returns a stop function. */
function playCached(
  url: string,
  opts: { volume: number; rate: number; loop?: boolean; at: () => number; el?: HTMLAudioElement | null; stream?: boolean },
): { el: () => HTMLAudioElement | null; stop: () => void } {
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  // Play at once: the downloaded copy when it's ready, otherwise stream now
  // (and keep downloading in the background for smooth seeking next time).
  const ready = url.startsWith("blob:") || url.startsWith("data:") ? url : audioReady.get(url);
  // Download the full copy only after playback is under way, so it never
  // competes with the stream the listener is waiting for.
  if (!ready && !opts.stream) setTimeout(() => !stopped && void cachedAudio(url).catch(() => {}), 6000);
  void Promise.resolve(ready ?? url)
    .then((src) => {
      if (stopped) return;
      // A player unlocked by the Play tap (phones block audio started later).
      const el = opts.el ?? new Audio();
      el.pause();
      el.preload = "auto";
      el.loop = !!opts.loop;
      el.volume = Math.min(1, Math.max(0, opts.volume));
      el.playbackRate = opts.rate;
      el.src = src;
      audio = el;
      el.addEventListener(
        "loadedmetadata",
        () => {
          if (stopped) return;
          const at = opts.at();
          el.currentTime = Number.isFinite(el.duration) && !el.loop ? Math.min(at, el.duration) : at;
          void el.play().catch(() => {});
        },
        { once: true },
      );
    });
  return {
    el: () => audio,
    stop: () => {
      stopped = true;
      audio?.pause();
    },
  };
}

/** How far ahead of the playhead video clips start downloading. */
const PREFETCH_SEC = 30;

/** Plain time: "0:07.6" while editing, "5:49" for a length (hours when needed). */
export function fmtTimecode(sec: number, _fps = 30, tenths = true): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  const base = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
  return tenths ? `${base}.${Math.floor((s - Math.floor(s)) * 10)}` : base;
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
  variant = "card",
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
  /** "viewer" fills its container (full-screen studio); "card" is a standalone block. */
  variant?: "card" | "viewer";
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
  const voiceAudioRef = useRef<{ el: () => HTMLAudioElement | null; stop: () => void } | null>(null);
  const musicRef = useRef<{ key: string; stop: () => void; setGain?: (g: number) => void } | null>(null);
  const voiceClipRef = useRef<TimelineClip | null>(null);
  const sfxFired = useRef(new Set<string>());
  const state = useRef({ comp, duration, playhead, masterMuted, volume, loop, assetFor, selectedId });
  useEffect(() => {
    state.current = { comp, duration, playhead, masterMuted, volume, loop, assetFor, selectedId };
  });

  // Download voice and music ahead of time so playback never streams mid-take.
  useEffect(() => {
    for (const c of comp.clips) {
      if (c.kind !== "voice" && c.kind !== "music" && c.kind !== "sfx") continue;
      const a = assetFor(c.assetId);
      const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
      // Very long tracks stream instead of downloading whole.
      if (url && !url.startsWith("{") && !((a?.durationSec ?? 0) > LONG_AUDIO_SEC)) void cachedAudio(url).catch(() => {});
    }
  }, [comp.clips, assetFor]);

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
      el.load(); // mobile browsers may not start buffering a detached element otherwise
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
  }

  function syncVideos(t: number, isPlaying: boolean) {
    const s = state.current;
    const mutedTracks = new Set(s.comp.tracks.filter((tr) => tr.muted).map((tr) => tr.id));
    const hidden = new Set(s.comp.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
    // Only fetch video clips near the playhead: loading every clip at once starves the one on screen.
    for (const clip of s.comp.clips)
      if (clip.kind === "video" && !hidden.has(clip.trackId) && t >= clip.startSec - PREFETCH_SEC && t < clip.startSec + clip.durationSec + 1) ensureMedia(clip);
    for (const clip of s.comp.clips) if (clip.kind === "image" && !hidden.has(clip.trackId)) ensureMedia(clip);
    for (const [clipId, { el }] of videos.current) {
      const clip = s.comp.clips.find((c) => c.id === clipId);
      if (!clip) {
        el.pause();
        videos.current.delete(clipId);
        continue;
      }
      // Far from the playhead: stop its download so bandwidth goes to what's on screen.
      if (t < clip.startSec - PREFETCH_SEC - 15 || t > clip.startSec + clip.durationSec + 15) {
        el.pause();
        el.removeAttribute("src");
        el.load();
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
    voiceAudioRef.current?.stop();
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
      voiceAudioRef.current?.stop();
      voiceAudioRef.current = null;
      const a = voice ? s.assetFor(voice.assetId) : null;
      const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
      if (voice && url) {
        const clip = voice;
        voiceAudioRef.current = playCached(url, {
          el: players.current?.voice,
          stream: (a?.durationSec ?? 0) > LONG_AUDIO_SEC,
          volume: mixGain(s.comp, voice, t) * s.volume,
          rate: voice.speed ?? 1,
          at: () => sourceTime(clip, state.current.playhead),
        });
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
          const clip = music;
          const h = playCached(url, {
            el: players.current?.music,
            stream: (a?.durationSec ?? 0) > LONG_AUDIO_SEC,
            volume: mixGain(s.comp, music, t) * s.volume,
            rate: music.speed ?? 1,
            loop: true,
            at: () => sourceTime(clip, state.current.playhead),
          });
          musicRef.current = {
            key: musicKey!,
            stop: h.stop,
            setGain: (g) => {
              const el = h.el();
              if (el) el.volume = Math.min(1, Math.max(0, g));
            },
          };
        } else if (a) {
          try {
            const recipe = JSON.parse(a.payload) as { mood: MusicMood; seconds: number };
            if (recipe?.mood) {
              const { buffer, context } = renderMusic(musicRecipe(recipe.mood, recipe.seconds));
              const source = context.createBufferSource();
              source.buffer = buffer;
              source.loop = true;
              const gain = context.createGain();
              gain.gain.value = mixGain(s.comp, music, t) * s.volume;
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
              musicRef.current = { key: musicKey!, stop: () => (release(), stop()), setGain: (g) => gain.gain.setTargetAtTime(Math.max(0, g), context.currentTime, 0.08) };
            }
          } catch {
            // Preview continues without music.
          }
        }
      }
    }

    // Live mix: volume changes and music ducking apply while playing.
    voiceClipRef.current = voice ?? null;
    const voiceEl = voiceAudioRef.current?.el();
    if (voice && voiceEl) voiceEl.volume = Math.min(1, Math.max(0, mixGain(s.comp, voice, t) * s.volume));
    if (music && musicRef.current?.setGain) musicRef.current.setGain(mixGain(s.comp, music, t) * s.volume);

    for (const clip of active.filter((c) => c.kind === "sfx")) {
      const key = `${clip.id}@${clip.startSec}`;
      if (sfxFired.current.has(key)) continue;
      sfxFired.current.add(key);
      const a = s.assetFor(clip.assetId);
      const url = a && (a.source === "provider-output" ? a.payload : a.source === "upload-session" ? a.blobUrl : null);
      if (url) {
        playCached(url, { volume: mixGain(s.comp, clip, t) * s.volume, rate: 1, at: () => 0, el: players.current?.sfx });
      } else if (a) {
        try {
          const recipe = JSON.parse(a.payload) as { type: SfxType };
          if (recipe?.type) {
            const { buffer, context } = renderSfx({ type: recipe.type, seconds: 3 });
            const source = context.createBufferSource();
            source.buffer = buffer;
            const gain = context.createGain();
            gain.gain.value = mixGain(s.comp, clip, t) * s.volume;
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

  /**
   * Phones only allow audio that starts inside a tap. Each Play tap "unlocks"
   * one reusable player per role (voice, music, effects) by playing a silent
   * sound; the real audio then plays through those same players.
   */
  const players = useRef<{ voice: HTMLAudioElement; music: HTMLAudioElement; sfx: HTMLAudioElement } | null>(null);
  function unlockAudio() {
    if (typeof Audio === "undefined") return;
    if (!players.current) players.current = { voice: new Audio(), music: new Audio(), sfx: new Audio() };
    for (const el of Object.values(players.current)) {
      el.muted = false;
      if (!el.src || el.paused) {
        el.src = SILENT_WAV;
        void el.play().then(() => el.pause()).catch(() => {});
      }
    }
    unlockWebAudio();
  }

  function toggle() {
    if (playingRef.current) {
      setPlayingState(false);
      stopAudio();
      syncVideos(state.current.playhead, false);
    } else {
      if (state.current.playhead >= state.current.duration - 0.05) onPlayhead(0);
      sfxFired.current.clear();
      unlockAudio();
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
     
    [],
  );

  const segment = sceneAt(segments, playhead);
  const empty = comp.clips.length === 0;

  const viewer = variant === "viewer";
  const iconBtn = "rounded-md p-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white";
  return (
    <section aria-label="Preview" className={cx("flex flex-col overflow-hidden", viewer ? "h-full bg-[#0b0b0d]" : "rounded-xl border border-border bg-black")}>
      <div ref={boxRef} className="flex min-h-0 flex-1 flex-col bg-[#0b0b0d]">
        <div className={cx("relative flex min-h-0 flex-1 items-center justify-center", viewer ? "p-4" : "p-2 sm:p-3")}>
          <canvas
            ref={canvasRef}
            width={PW}
            height={PH}
            onClick={toggle}
            className={cx("cursor-pointer bg-black shadow-[0_8px_40px_rgba(0,0,0,0.6)]", viewer ? "max-h-full max-w-full" : "max-h-[62vh] w-full max-w-full object-contain")}
            style={viewer ? { width: "auto", height: "auto", aspectRatio: `${W} / ${H}` } : { aspectRatio: `${W} / ${H}` }}
            aria-label={`Preview frame at ${fmtTimecode(playhead, fps)}${segment ? `, scene ${segment.number}` : ""}`}
            role="img"
          />
          {empty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">Import a video or add clips to start editing</p>
          )}
        </div>
        {!viewer && (
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
            className="mx-3 accent-cyan-400"
          />
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-white/5 px-3 py-1.5">
          <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-zinc-300 sm:text-[11px]" aria-live="off">
            {fmtTimecode(playhead, fps)} <span className="text-zinc-600">/ {fmtTimecode(duration, fps, false)}</span>
          </span>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => onPlayhead(0)} aria-label="Go to start" className={iconBtn}><SkipBack className="size-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => onPlayhead(Math.max(0, playhead - 1 / fps))} aria-label="Previous frame" className={iconBtn}><ChevronLeft className="size-4" aria-hidden="true" /></button>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause (Space)" : "Play (Space)"}
              aria-pressed={playing}
              className="mx-1 flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            >
              {playing ? <Pause className="size-5 fill-current" aria-hidden="true" /> : <Play className="size-5 translate-x-px fill-current" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => onPlayhead(Math.min(duration, playhead + 1 / fps))} aria-label="Next frame" className={iconBtn}><ChevronRight className="size-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => onPlayhead(duration)} aria-label="Go to end" className={iconBtn}><SkipForward className="size-4" aria-hidden="true" /></button>
          </div>
          <div className="flex items-center justify-end gap-0.5">
            <button type="button" onClick={() => setLoop((l) => !l)} aria-pressed={loop} aria-label="Loop playback" className={cx(iconBtn, loop && "text-cyan-400")}>
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
              className={iconBtn}
            >
              {masterMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Preview volume" className="hidden w-16 accent-cyan-400 sm:block" />
            <button type="button" onClick={() => boxRef.current?.requestFullscreen?.().catch(() => {})} aria-label="Fullscreen" className={iconBtn}>
              <Maximize className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
