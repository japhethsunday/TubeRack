"use client";
import { isChunked } from "@/src/lib/media/chunked";

import type { Composition, TimelineClip } from "@/src/lib/video/types";
import { renderMusic, renderSfx, musicRecipe, type MusicMood, type SfxType } from "@/src/lib/media/audio";
import { drawComposition, sourceTime, transitionState, type VisualSource } from "@/src/lib/video/compositor";

/**
 * Exporter: plays the composition through the shared frame compositor onto
 * a canvas in real time and records it — with every audio source mixed,
 * including the original sound of video clips — via MediaRecorder.
 */

export interface RenderAsset {
  kind: string;
  source: string; // local-draft | provider-output | upload-session
  payload: string;
  mime: string;
  title: string;
  /** Object URL for device-stored uploads (null when the bytes are unavailable). */
  blobUrl: string | null;
}

export type ExportQuality = "draft" | "standard" | "high" | "max";

export interface RenderOptions {
  comp: Composition;
  duration: number;
  width: number;
  height: number;
  fps: number;
  quality?: ExportQuality;
  audioKbps?: number;
  /** Export only [from, to) of the timeline. */
  range?: { from: number; to: number };
  assetFor: (id: string | undefined) => RenderAsset | null;
  onProgress: (p: { phase: "preparing" | "rendering" | "finalizing"; ratio: number; message: string; elapsedSec?: number; etaSec?: number }) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  mime: string;
  warnings: string[];
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export class RenderError extends Error {}

const BITS_PER_PIXEL: Record<ExportQuality, number> = { draft: 0.06, standard: 0.1, high: 0.15, max: 0.22 };

export function estimateBitrate(width: number, height: number, fps: number, quality: ExportQuality = "high"): number {
  return Math.round(width * height * fps * BITS_PER_PIXEL[quality]);
}

/** Best container the browser can record; YouTube accepts MP4 and WebM. */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function renderSupport(): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false, reason: "Rendering runs in the browser." };
  if (!pickRecorderMime()) return { ok: false, reason: "This browser can't record video. Use a current Chrome, Edge, Firefox, or Safari." };
  if (!("captureStream" in HTMLCanvasElement.prototype)) return { ok: false, reason: "This browser can't capture canvas video." };
  return { ok: true };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

export function loadVideo(src: string, muted = true): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = muted;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("video failed to load"));
    v.src = src;
  });
}

/** URL to load an asset's bytes from, or null. */
export function assetUrl(a: RenderAsset | null, kind: string): string | null {
  if (!a) return null;
  if (a.source === "local-draft" && kind === "image" && a.payload.startsWith("<svg")) {
    return URL.createObjectURL(new Blob([a.payload], { type: "image/svg+xml" }));
  }
  // Multi-part uploads play from the reassembled copy on this device.
  if (a.source === "provider-output") return isChunked(a.payload) ? a.blobUrl : a.blobUrl ?? (a.payload || null);
  return a.blobUrl;
}

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed (${res.status})`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function reversed(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) out.getChannelData(ch).set(Array.from(b.getChannelData(ch)).reverse());
  return out;
}

function fadeGain(c: TimelineClip, t: number): number {
  const local = t - c.startSec;
  const out = c.startSec + c.durationSec - t;
  let g = 1;
  if (c.fadeInSec > 0) g = Math.min(g, local / c.fadeInSec);
  if (c.fadeOutSec > 0) g = Math.min(g, out / c.fadeOutSec);
  return Math.max(0, Math.min(1, g));
}

/** Render the composition to a video Blob (takes about as long as the range). */
export async function renderComposition(o: RenderOptions): Promise<RenderResult> {
  const support = renderSupport();
  if (!support.ok) throw new RenderError(support.reason);
  const mime = pickRecorderMime()!;
  const warnings: string[] = [];
  const W = Math.round(o.width / 2) * 2;
  const H = Math.round(o.height / 2) * 2;
  const from = Math.max(0, o.range?.from ?? 0);
  const to = Math.min(o.duration, o.range?.to ?? o.duration);
  const span = Math.max(0.1, to - from);
  const hidden = new Set(o.comp.tracks.filter((t) => t.hidden).map((t) => t.id));
  const mutedTracks = new Set(o.comp.tracks.filter((t) => t.muted).map((t) => t.id));
  const inRange = (c: TimelineClip) => c.startSec < to && c.startSec + c.durationSec > from;
  const clips = o.comp.clips.filter((c) => !hidden.has(c.trackId) && inRange(c));
  const assetOf = (c: TimelineClip) => o.assetFor(c.assetId);

  // ---- 1. Load visuals (images per asset, one video element per clip). ----
  o.onProgress({ phase: "preparing", ratio: 0, message: "Loading media…" });
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  const media = clips.filter((c) => c.kind === "image" || c.kind === "video");
  let loaded = 0;
  for (const clip of media) {
    if (o.signal?.aborted) throw new RenderError("Export cancelled.");
    const url = assetUrl(assetOf(clip), clip.kind);
    try {
      if (!url) throw new Error("missing");
      if (clip.kind === "image") {
        if (clip.assetId && !images.has(clip.assetId)) images.set(clip.assetId, await loadImage(url));
      } else {
        videos.set(clip.id, await loadVideo(url, false));
      }
    } catch {
      warnings.push(`“${clip.name}” couldn't be loaded — it was left out. Re-import it and export again.`);
    }
    o.onProgress({ phase: "preparing", ratio: (++loaded / Math.max(1, media.length)) * 0.6, message: "Loading media…" });
  }

  // ---- 2. Audio graph. ----
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const master = audioCtx.createGain();
  master.connect(dest);
  const scheduled: { clip: TimelineClip; buffer: AudioBuffer; loop: boolean; gain: number }[] = [];
  const audioClips = clips.filter((c) => (c.kind === "voice" || c.kind === "music" || c.kind === "sfx") && !c.muted && !mutedTracks.has(c.trackId));
  let deviceVoices = 0;
  for (const clip of audioClips) {
    const a = assetOf(clip);
    if (!a) continue;
    const gain = clip.kind === "music" ? clip.volume * 0.8 : clip.volume;
    try {
      let buffer: AudioBuffer | null = null;
      if (a.source === "provider-output" || a.source === "upload-session") {
        const url = a.source === "provider-output" ? a.payload : a.blobUrl;
        if (!url) throw new Error("bytes unavailable");
        buffer = await decode(audioCtx, url);
      } else if (clip.kind === "music") {
        const recipe = JSON.parse(a.payload) as { mood?: MusicMood; seconds?: number };
        if (recipe.mood) buffer = renderMusic(musicRecipe(recipe.mood, recipe.seconds ?? 30)).buffer;
      } else if (clip.kind === "sfx") {
        const recipe = JSON.parse(a.payload) as { type?: SfxType };
        if (recipe.type) buffer = renderSfx({ type: recipe.type, seconds: 3 }).buffer;
      } else if (clip.kind === "voice") deviceVoices++;
      if (buffer) scheduled.push({ clip, buffer: clip.reverse ? reversed(audioCtx, buffer) : buffer, loop: clip.kind === "music", gain });
    } catch {
      warnings.push(`Audio “${clip.name}” couldn't be loaded and was left out.`);
    }
  }
  if (deviceVoices) {
    warnings.push(`${deviceVoices} voice clip(s) use your device's built-in voice, which browsers can't record. Generate those takes with Gemini in the Voice studio to include them.`);
  }
  // Original sound of video clips, routed into the mix (never to the speakers).
  const videoGains = new Map<string, GainNode>();
  for (const [clipId, el] of videos) {
    const clip = clips.find((c) => c.id === clipId)!;
    if (clip.muted || mutedTracks.has(clip.trackId) || clip.volume <= 0) continue;
    try {
      const g = audioCtx.createGain();
      g.gain.value = 0;
      audioCtx.createMediaElementSource(el).connect(g).connect(master);
      videoGains.set(clipId, g);
    } catch {
      warnings.push(`The sound of “${clip.name}” couldn't be captured.`);
    }
  }
  o.onProgress({ phase: "preparing", ratio: 1, message: "Starting export…" });

  // ---- 3. Canvas + recorder. ----
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new RenderError("Canvas unavailable.");
  const stream = canvas.captureStream(o.fps);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: estimateBitrate(W, H, o.fps, o.quality ?? "high"),
      audioBitsPerSecond: (o.audioKbps ?? 192) * 1000,
    });
  } catch {
    throw new RenderError("The browser refused to start recording. If media came from another website, re-import it and try again.");
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  if (audioCtx.state === "suspended") await audioCtx.resume();
  // t0 is set once media is pre-rolled, just before recording starts.
  let t0 = 0;
  const scheduleAudio = () => {
  for (const s of scheduled) {
    const clipStart = Math.max(s.clip.startSec, from);
    const clipEnd = Math.min(s.clip.startSec + s.clip.durationSec, to);
    if (clipEnd <= clipStart) continue;
    const speed = s.clip.speed ?? 1;
    const src = audioCtx.createBufferSource();
    src.buffer = s.buffer;
    src.loop = s.loop;
    src.playbackRate.value = speed;
    const g = audioCtx.createGain();
    const start = t0 + (clipStart - from);
    const end = t0 + (clipEnd - from);
    // Offset into the source: in-point plus any part cut off by the range.
    const offset = (s.clip.inSec ?? 0) + (clipStart - s.clip.startSec) * speed;
    const fi = s.clip.fadeInSec;
    const fo = s.clip.fadeOutSec;
    g.gain.setValueAtTime(fi > 0 ? 0 : s.gain, start);
    if (fi > 0) g.gain.linearRampToValueAtTime(s.gain, t0 + (s.clip.startSec + fi - from));
    if (fo > 0) {
      g.gain.setValueAtTime(s.gain, Math.max(start, end - fo));
      g.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(g).connect(master);
    src.start(start, s.loop ? offset % Math.max(0.01, s.buffer.duration) : Math.min(offset, s.buffer.duration));
    src.stop(end);
  }
  };

  const syncVideos = (t: number, playing: boolean) => {
    for (const [clipId, el] of videos) {
      const clip = clips.find((c) => c.id === clipId)!;
      const active = t >= clip.startSec && t < clip.startSec + clip.durationSec;
      const g = videoGains.get(clipId);
      if (!active) {
        if (!el.paused) el.pause();
        if (g) g.gain.value = 0;
        continue;
      }
      const want = sourceTime(clip, t, el.duration || undefined);
      if (clip.reverse) {
        // Browsers can't play backwards: step the frame each tick.
        if (!el.paused) el.pause();
        el.currentTime = want;
      } else {
        el.playbackRate = Math.min(4, Math.max(0.25, clip.speed ?? 1));
        if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
        if (playing && el.paused) void el.play().catch(() => {});
      }
      if (g) g.gain.value = clip.reverse ? 0 : clip.volume * fadeGain(clip, t) * transitionState(clip, t).alpha;
    }
  };

  const draw = (t: number) =>
    drawComposition(ctx, o.comp, t, W, H, {
      sourceFor: (c) => (c.kind === "video" ? (videos.get(c.id) as VisualSource | undefined) ?? null : c.assetId ? images.get(c.assetId) ?? null : null),
      isDraft: (c) => assetOf(c)?.source === "local-draft",
    });

  // Pre-roll: seek videos to their first frame, then start clock + recorder together.
  syncVideos(from, false);
  await new Promise((r) => setTimeout(r, 250));
  draw(from);
  t0 = audioCtx.currentTime + 0.05;
  scheduleAudio();

  // ---- 4. Real-time playback into the recorder. ----
  recorder.start(1000);
  const wall = performance.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const frameMs = 1000 / o.fps;
      const tick = () => {
        if (o.signal?.aborted) {
          reject(new RenderError("Export cancelled."));
          return;
        }
        const elapsed = audioCtx.currentTime - t0;
        const t = from + Math.max(0, elapsed);
        if (elapsed >= span) {
          resolve();
          return;
        }
        syncVideos(t, true);
        draw(t);
        const ratio = Math.max(0, elapsed) / span;
        const secs = (performance.now() - wall) / 1000;
        o.onProgress({ phase: "rendering", ratio, message: "Exporting…", elapsedSec: secs, etaSec: ratio > 0.02 ? secs / ratio - secs : undefined });
        // setTimeout (not rAF) keeps exporting while the tab is in the background.
        window.setTimeout(tick, frameMs / 2);
      };
      tick();
    });
  } catch (error) {
    try {
      recorder.stop();
    } catch {
      // already stopped
    }
    stream.getTracks().forEach((t) => t.stop());
    for (const el of videos.values()) el.pause();
    void audioCtx.close();
    throw error;
  }

  o.onProgress({ phase: "finalizing", ratio: 1, message: "Finalizing file…" });
  for (const el of videos.values()) el.pause();
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  void audioCtx.close();
  for (const el of videos.values()) {
    el.removeAttribute("src");
    el.load();
  }
  const type = mime.split(";")[0];
  const blob = new Blob(chunks, { type });
  if (blob.size < 1000) throw new RenderError("The export produced an empty file. Keep this tab open while exporting and try again.");
  return { blob, mime: type, warnings, width: W, height: H, fps: o.fps, durationSec: span };
}
