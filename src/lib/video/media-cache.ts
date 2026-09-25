"use client";

/**
 * Timeline visuals: filmstrip frames for video/image clips and waveform
 * peaks for anything with audio. Generated lazily in the background,
 * cached per source URL, and never block editing.
 */

export interface Filmstrip {
  /** Seconds between frames. */
  step: number;
  frames: string[]; // data URLs (small JPEGs)
  duration: number;
}

const strips = new Map<string, Promise<Filmstrip | null>>();
const peaksCache = new Map<string, Promise<Float32Array | null>>();

const FRAME_W = 96;
const MAX_FRAMES = 60;

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    setTimeout(done, 3000);
  });
}

async function buildStrip(url: string): Promise<Filmstrip | null> {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("load"));
    setTimeout(() => reject(new Error("timeout")), 20_000);
  });
  let duration = v.duration;
  if (!Number.isFinite(duration)) {
    await seek(v, 1e9);
    duration = v.duration;
  }
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.ceil(duration / 2)));
  const step = duration / count;
  const h = Math.round((FRAME_W * (v.videoHeight || 9)) / (v.videoWidth || 16));
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    await seek(v, Math.min(duration - 0.05, i * step + step / 2));
    ctx.drawImage(v, 0, 0, FRAME_W, h);
    try {
      frames.push(canvas.toDataURL("image/jpeg", 0.6));
    } catch {
      return null; // cross-origin without CORS
    }
  }
  v.removeAttribute("src");
  v.load();
  return { step, frames, duration };
}

/** Filmstrip for a video URL (cached; null when unavailable). */
export function filmstripFor(url: string): Promise<Filmstrip | null> {
  let p = strips.get(url);
  if (!p) {
    p = buildStrip(url).catch(() => null);
    strips.set(url, p);
  }
  return p;
}

/**
 * One download per media file, shared by the waveform, the preview player and
 * anything else that needs the bytes (they used to fetch the same file
 * several times each visit).
 */
const blobs = new Map<string, Promise<Blob>>();
const MAX_SHARED_BYTES = 80 * 1024 * 1024;
export function sharedBlob(url: string): Promise<Blob> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return fetch(url).then((r) => r.blob());
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
    p.then((b) => b.size > MAX_SHARED_BYTES && blobs.delete(url)).catch(() => blobs.delete(url));
    blobs.set(url, p);
  }
  return p;
}

/** Peaks per second of audio (max |amplitude| per bucket), for waveforms. */
export const PEAKS_PER_SEC = 50;
/** Beyond this a waveform would decode to gigabytes (a 2-hour song): skip it. */
const MAX_WAVEFORM_BYTES = 40 * 1024 * 1024;

async function buildPeaks(url: string): Promise<Float32Array | null> {
  const blob = await sharedBlob(url);
  if (blob.size > MAX_WAVEFORM_BYTES) return null;
  // Low sample rate: a waveform needs shape, not fidelity (and ~5x less memory).
  const ctx = new OfflineAudioContext(1, 1, 8_000);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const bucket = Math.max(1, Math.floor(buf.sampleRate / PEAKS_PER_SEC));
  const n = Math.ceil(buf.length / bucket);
  const out = new Float32Array(n);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let m = 0;
    const end = Math.min(buf.length, (i + 1) * bucket);
    for (let j = i * bucket; j < end; j += 4) {
      for (const ch of chans) {
        const a = Math.abs(ch[j]);
        if (a > m) m = a;
      }
    }
    out[i] = m;
  }
  return out;
}

export function peaksFor(url: string): Promise<Float32Array | null> {
  let p = peaksCache.get(url);
  if (!p) {
    p = buildPeaks(url).catch(() => null);
    peaksCache.set(url, p);
  }
  return p;
}
