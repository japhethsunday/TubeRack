"use client";

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { TimelineClip } from "@/src/lib/video/types";
import { drawComposition, sourceTime, type VisualSource } from "@/src/lib/video/compositor";
import { mixGain, MUSIC_DUCK, trackVolume, voiceRanges } from "@/src/lib/video/mix";
import { renderMusic, renderSfx, musicRecipe, type MusicMood, type SfxType } from "@/src/lib/media/audio";
import { assetUrl, estimateBitrate, loadImage, loadVideo, RenderError, type RenderOptions, type RenderResult } from "@/src/lib/video/render";

/**
 * Fast exporter: draws every frame directly and encodes it with the
 * browser's hardware video encoder (WebCodecs), while the whole audio mix is
 * rendered offline in one pass — no real-time playback, so a timeline built
 * from images and voice exports several times faster than its length.
 * Returns null when the browser can't do this (the caller falls back to the
 * real-time recorder).
 */

const SAMPLE_RATE = 48_000;

export function fastExportSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window && "VideoFrame" in window && typeof OfflineAudioContext !== "undefined";
}

async function pickVideoConfig(W: number, H: number, fps: number, bitrate: number): Promise<{ config: VideoEncoderConfig; muxCodec: "avc" | "vp9" } | null> {
  // H.264 first (plays everywhere); VP9 where the browser has no H.264 encoder (YouTube accepts both).
  const big = W * H > 1920 * 1088;
  const candidates: [string, "avc" | "vp9"][] = [
    ...((big ? ["avc1.640033", "avc1.640034", "avc1.4d0033"] : ["avc1.640028", "avc1.4d0028", "avc1.42e028"]).map((c) => [c, "avc"] as [string, "avc"])),
    [big ? "vp09.00.41.08" : "vp09.00.40.08", "vp9"],
    ["vp09.00.10.08", "vp9"],
  ];
  for (const [codec, muxCodec] of candidates) {
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
      const config: VideoEncoderConfig = { codec, width: W, height: H, bitrate, framerate: fps, hardwareAcceleration, ...(muxCodec === "avc" ? { avc: { format: "avc" } } : {}) };
      const res = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (res?.supported) return { config, muxCodec };
    }
  }
  return null;
}

async function pickAudioConfig(bitrate: number): Promise<{ config: AudioEncoderConfig; muxCodec: "aac" | "opus" } | null> {
  for (const [codec, muxCodec] of [["mp4a.40.2", "aac"], ["opus", "opus"]] as const) {
    const config: AudioEncoderConfig = { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate };
    const res = await AudioEncoder.isConfigSupported(config).catch(() => null);
    if (res?.supported) return { config, muxCodec };
  }
  return null;
}

async function fetchBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed (${res.status})`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function reversed(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) out.getChannelData(ch).set(Array.from(b.getChannelData(ch)).reverse());
  return out;
}

/** The full audio mix of [from, to), rendered offline (same rules as the preview). */
async function mixAudio(o: RenderOptions, clips: TimelineClip[], from: number, span: number, warnings: string[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(span * SAMPLE_RATE)), SAMPLE_RATE);
  const muted = new Set(o.comp.tracks.filter((t) => t.muted).map((t) => t.id));
  const to = from + span;
  const ducks = voiceRanges(o.comp);
  const audible = clips.filter((c) => !c.muted && !muted.has(c.trackId) && (c.kind === "voice" || c.kind === "music" || c.kind === "sfx" || c.kind === "video"));
  let deviceVoices = 0;
  for (const clip of audible) {
    const a = o.assetFor(clip.assetId);
    if (!a) continue;
    let buffer: AudioBuffer | null = null;
    try {
      if (clip.kind === "video") {
        if (clip.reverse || clip.volume <= 0) continue;
        const url = assetUrl(a, "video");
        if (!url) continue;
        buffer = await fetchBuffer(ctx, url).catch(() => null);
        if (!buffer) continue; // silent or unreadable track: nothing to mix
      } else if (a.source === "provider-output" || a.source === "upload-session") {
        const url = a.source === "provider-output" ? a.payload : a.blobUrl;
        if (!url) throw new Error("bytes unavailable");
        buffer = await fetchBuffer(ctx, url);
      } else if (clip.kind === "music") {
        const recipe = JSON.parse(a.payload) as { mood?: MusicMood; seconds?: number };
        if (recipe.mood) buffer = renderMusic(musicRecipe(recipe.mood, recipe.seconds ?? 30)).buffer;
      } else if (clip.kind === "sfx") {
        const recipe = JSON.parse(a.payload) as { type?: SfxType };
        if (recipe.type) buffer = renderSfx({ type: recipe.type, seconds: 3 }).buffer;
      } else if (clip.kind === "voice") deviceVoices++;
    } catch {
      warnings.push(`Audio “${clip.name}” couldn't be loaded and was left out.`);
      continue;
    }
    if (!buffer) continue;
    if (clip.reverse) buffer = reversed(ctx, buffer);
    const clipStart = Math.max(clip.startSec, from);
    const clipEnd = Math.min(clip.startSec + clip.durationSec, to);
    if (clipEnd <= clipStart) continue;
    const speed = clip.speed ?? 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = clip.kind === "music";
    src.playbackRate.value = speed;
    const base = clip.kind === "video" ? clip.volume * trackVolume(o.comp, clip.trackId) : mixGain(o.comp, clip);
    const g = ctx.createGain();
    const start = clipStart - from;
    const end = clipEnd - from;
    g.gain.setValueAtTime(clip.fadeInSec > 0 ? 0 : base, start);
    if (clip.fadeInSec > 0) g.gain.linearRampToValueAtTime(base, clip.startSec + clip.fadeInSec - from);
    if (clip.fadeOutSec > 0) {
      g.gain.setValueAtTime(base, Math.max(start, end - clip.fadeOutSec));
      g.gain.linearRampToValueAtTime(0, end);
    }
    let node: AudioNode = src.connect(g);
    if (clip.kind === "music") {
      const duck = ctx.createGain();
      duck.gain.setValueAtTime(1, 0);
      for (const [a0, b0] of ducks) {
        if (b0 <= from || a0 >= to) continue;
        duck.gain.setTargetAtTime(MUSIC_DUCK, Math.max(0, a0 - from - 0.05), 0.08);
        duck.gain.setTargetAtTime(1, b0 - from, 0.25);
      }
      node = node.connect(duck);
    }
    node.connect(ctx.destination);
    const offset = (clip.inSec ?? 0) + (clipStart - clip.startSec) * speed;
    src.start(start, src.loop ? offset % Math.max(0.01, buffer.duration) : Math.min(offset, buffer.duration));
    src.stop(end);
  }
  if (deviceVoices) {
    warnings.push(`${deviceVoices} voice clip(s) use your device's built-in voice, which can't be recorded. Generate those takes in the Voice studio to include them.`);
  }
  return ctx.startRendering();
}

function seek(el: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(el.currentTime - time) < 0.001 && el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener("seeked", done);
      resolve();
    };
    el.addEventListener("seeked", done);
    el.currentTime = time;
    window.setTimeout(done, 3000); // never hang on a stuck seek
  });
}

export async function renderFast(o: RenderOptions): Promise<RenderResult | null> {
  if (!fastExportSupported()) return null;
  const W = Math.round(o.width / 2) * 2;
  const H = Math.round(o.height / 2) * 2;
  const fps = o.fps;
  const from = Math.max(0, o.range?.from ?? 0);
  const to = Math.min(o.duration, o.range?.to ?? o.duration);
  const span = Math.max(0.1, to - from);
  const video = await pickVideoConfig(W, H, fps, estimateBitrate(W, H, fps, o.quality ?? "high"));
  const audio = await pickAudioConfig((o.audioKbps ?? 192) * 1000);
  if (!video || !audio) return null;

  const warnings: string[] = [];
  const hidden = new Set(o.comp.tracks.filter((t) => t.hidden).map((t) => t.id));
  const clips = o.comp.clips.filter((c) => !hidden.has(c.trackId) && c.startSec < to && c.startSec + c.durationSec > from);
  const wall = performance.now();

  // ---- 1. Media. ----
  o.onProgress({ phase: "preparing", ratio: 0, message: "Loading media…" });
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  const media = clips.filter((c) => c.kind === "image" || c.kind === "video");
  let loaded = 0;
  for (const clip of media) {
    if (o.signal?.aborted) throw new RenderError("Export cancelled.");
    const url = assetUrl(o.assetFor(clip.assetId), clip.kind);
    if (url) {
      try {
        if (clip.kind === "image" && clip.assetId && !images.has(clip.assetId)) images.set(clip.assetId, await loadImage(url));
        if (clip.kind === "video") videos.set(clip.id, await loadVideo(url, true));
      } catch {
        warnings.push(`“${clip.name}” couldn't be loaded and was left out.`);
      }
    }
    o.onProgress({ phase: "preparing", ratio: (++loaded / Math.max(1, media.length)) * 0.5, message: "Loading media…" });
  }

  // ---- 2. Audio mix (offline, much faster than real time). ----
  o.onProgress({ phase: "preparing", ratio: 0.6, message: "Mixing audio…" });
  const mixed = await mixAudio(o, clips, from, span, warnings);
  if (o.signal?.aborted) throw new RenderError("Export cancelled.");

  // ---- 3. Encoders + MP4 muxer. ----
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: video.muxCodec, width: W, height: H, frameRate: fps },
    audio: { codec: audio.muxCodec, sampleRate: SAMPLE_RATE, numberOfChannels: 2 },
    fastStart: "in-memory",
  });
  let failure: Error | null = null;
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  videoEncoder.configure(video.config);
  const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
  audioEncoder.configure(audio.config);

  // Audio: planar float frames in ~20 ms blocks.
  const left = mixed.getChannelData(0);
  const right = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : left;
  const BLOCK = 960;
  for (let i = 0; i < mixed.length; i += BLOCK) {
    const n = Math.min(BLOCK, mixed.length - i);
    const data = new Float32Array(n * 2);
    data.set(left.subarray(i, i + n), 0);
    data.set(right.subarray(i, i + n), n);
    const frame = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data });
    audioEncoder.encode(frame);
    frame.close();
  }

  // ---- 4. Video: draw and encode each frame. ----
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new RenderError("Canvas unavailable.");
  const total = Math.max(1, Math.round(span * fps));
  const frameUs = 1e6 / fps;
  const assetOf = (c: TimelineClip) => o.assetFor(c.assetId);
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new RenderError("Export cancelled.");
      if (failure) throw failure;
      const t = from + i / fps;
      for (const [clipId, el] of videos) {
        const clip = clips.find((c) => c.id === clipId)!;
        if (t >= clip.startSec && t < clip.startSec + clip.durationSec) await seek(el, sourceTime(clip, t, Number.isFinite(el.duration) ? el.duration : undefined));
      }
      drawComposition(ctx, o.comp, t, W, H, {
        sourceFor: (c) => (c.kind === "video" ? (videos.get(c.id) as VisualSource | undefined) ?? null : c.assetId ? images.get(c.assetId) ?? null : null),
        isDraft: (c) => assetOf(c)?.source === "local-draft",
      });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      // Let the encoder catch up instead of queueing hundreds of frames in memory.
      while (videoEncoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
      if (i % 5 === 0) {
        const ratio = (i + 1) / total;
        const secs = (performance.now() - wall) / 1000;
        o.onProgress({ phase: "rendering", ratio, message: "Exporting…", elapsedSec: secs, etaSec: ratio > 0.02 ? secs / ratio - secs : undefined });
        await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
      }
    }
    o.onProgress({ phase: "finalizing", ratio: 1, message: "Finalizing file…" });
    await videoEncoder.flush();
    await audioEncoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder.state !== "closed") audioEncoder.close();
    for (const el of videos.values()) {
      el.removeAttribute("src");
      el.load();
    }
  }
  const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
  if (blob.size < 1000) throw new RenderError("The export produced an empty file. Please try again.");
  return { blob, mime: "video/mp4", warnings, width: W, height: H, fps, durationSec: span };
}
