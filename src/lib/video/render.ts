"use client";

import type { Composition, TimelineClip, TextStyle } from "@/src/lib/video/types";
import { renderMusic, renderSfx, musicRecipe, type MusicMood, type SfxType } from "@/src/lib/media/audio";

/**
 * Browser renderer: plays the composition onto a canvas in real time and
 * records it (with a mixed audio track) through MediaRecorder. What you see
 * in the preview is what gets encoded — same visuals, motion, text layers,
 * captions, voice, music, and sound effects.
 */

export interface RenderAsset {
  kind: string;
  source: string; // local-draft | provider-output | upload-session
  payload: string;
  mime: string;
  title: string;
  /** Object URL for session uploads (null when the bytes are gone). */
  blobUrl: string | null;
}

export interface RenderOptions {
  comp: Composition;
  duration: number;
  width: number;
  height: number;
  fps: number;
  assetFor: (id: string | undefined) => RenderAsset | null;
  onProgress: (p: { phase: "preparing" | "rendering" | "finalizing"; ratio: number; message: string }) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  mime: string;
  warnings: string[];
}

export class RenderError extends Error {}

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("video failed to load"));
    v.src = src;
  });
}

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed (${res.status})`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Ken Burns style motion, matching the preview's CSS keyframes. */
function motionTransform(motion: string | undefined, p: number): { scale: number; dx: number; dy: number } {
  const e = p * p * (3 - 2 * p);
  switch (motion) {
    case "kenburns":
      return { scale: 1 + 0.12 * e, dx: -0.03 * e, dy: -0.02 * e };
    case "zoom-in":
      return { scale: 1 + 0.15 * e, dx: 0, dy: 0 };
    case "zoom-out":
      return { scale: 1.15 - 0.15 * e, dx: 0, dy: 0 };
    case "pan-left":
      return { scale: 1.12, dx: 0.04 - 0.08 * e, dy: 0 };
    case "pan-right":
      return { scale: 1.12, dx: -0.04 + 0.08 * e, dy: 0 };
    case "pan-up":
      return { scale: 1.12, dx: 0, dy: 0.04 - 0.08 * e };
    case "pan-down":
      return { scale: 1.12, dx: 0, dy: -0.04 + 0.08 * e };
    default:
      return { scale: 1, dx: 0, dy: 0 };
  }
}

function drawContain(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number, motion: { scale: number; dx: number; dy: number }, cover: boolean) {
  const fit = cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const w = sw * fit * motion.scale;
  const h = sh * fit * motion.scale;
  ctx.drawImage(src, (W - w) / 2 + motion.dx * W, (H - h) / 2 + motion.dy * H, w, h);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { fontPx: number; weight: number; font: string; color: string; background: string; align: CanvasTextAlign; y: number; anchor: "top" | "middle" | "bottom"; W: number; opacity: number },
) {
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.font = `${opts.weight} ${opts.fontPx}px ${opts.font || "Inter, system-ui, sans-serif"}`;
  ctx.textBaseline = "middle";
  const padX = opts.fontPx * 0.5;
  const padY = opts.fontPx * 0.18;
  const lineH = opts.fontPx * 1.25;
  const lines = wrapLines(ctx, text, opts.W * 0.86);
  const blockH = lines.length * lineH;
  let top = opts.anchor === "top" ? opts.y : opts.anchor === "middle" ? opts.y - blockH / 2 : opts.y - blockH;
  for (const line of lines) {
    const tw = ctx.measureText(line).width;
    const x = opts.align === "left" ? opts.W * 0.05 : opts.align === "right" ? opts.W * 0.95 - tw : (opts.W - tw) / 2;
    if (opts.background && opts.background !== "transparent") {
      ctx.fillStyle = opts.background;
      const r = opts.fontPx * 0.3;
      ctx.beginPath();
      ctx.roundRect(x - padX, top - padY + (lineH - opts.fontPx) / 2 - 2, tw + padX * 2, opts.fontPx + padY * 2 + 4, r);
      ctx.fill();
    }
    ctx.fillStyle = opts.color;
    ctx.textAlign = "left";
    ctx.fillText(line, x, top + lineH / 2);
    top += lineH;
  }
  ctx.restore();
}

function fadeFactor(clip: TimelineClip, t: number): number {
  const local = t - clip.startSec;
  const out = clip.startSec + clip.durationSec - t;
  let f = 1;
  if (clip.fadeInSec > 0) f = Math.min(f, local / clip.fadeInSec);
  if (clip.fadeOutSec > 0) f = Math.min(f, out / clip.fadeOutSec);
  if (clip.transitionIn === "fade" || clip.transitionIn === "crossfade") f = Math.min(f, local / 0.5);
  if (clip.transitionOut === "fade" || clip.transitionOut === "crossfade") f = Math.min(f, out / 0.5);
  return Math.max(0, Math.min(1, f));
}

/** Render the whole composition to a video Blob (takes about as long as the video). */
export async function renderComposition(o: RenderOptions): Promise<RenderResult> {
  const support = renderSupport();
  if (!support.ok) throw new RenderError(support.reason);
  const mime = pickRecorderMime()!;
  const warnings: string[] = [];
  const W = o.width;
  const H = o.height;
  const hidden = new Set(o.comp.tracks.filter((t) => t.hidden).map((t) => t.id));
  const mutedTracks = new Set(o.comp.tracks.filter((t) => t.muted).map((t) => t.id));
  const clips = o.comp.clips.filter((c) => !hidden.has(c.trackId) && c.startSec < o.duration);

  // ---- 1. Load every visual and audio source up front. ----
  o.onProgress({ phase: "preparing", ratio: 0, message: "Loading media…" });
  const visuals = new Map<string, HTMLImageElement | HTMLVideoElement>();
  const visualClips = clips.filter((c) => c.kind === "image" || c.kind === "video");
  let loaded = 0;
  for (const clip of visualClips) {
    if (!clip.assetId || visuals.has(clip.assetId)) continue;
    const a = o.assetFor(clip.assetId);
    try {
      if (!a) throw new Error("missing");
      if (clip.kind === "image") {
        const src =
          a.source === "local-draft" && a.payload.startsWith("<svg")
            ? URL.createObjectURL(new Blob([a.payload], { type: "image/svg+xml" }))
            : a.source === "provider-output"
              ? a.payload
              : a.blobUrl;
        if (!src) throw new Error("bytes unavailable");
        visuals.set(clip.assetId, await loadImage(src));
      } else {
        const src = a.source === "provider-output" ? a.payload : a.blobUrl;
        if (!src) throw new Error("bytes unavailable");
        visuals.set(clip.assetId, await loadVideo(src));
      }
    } catch {
      warnings.push(`“${clip.name}” couldn't be loaded (re-upload it this session) — a title card is shown instead.`);
    }
    o.onProgress({ phase: "preparing", ratio: ++loaded / Math.max(1, visualClips.length) * 0.6, message: "Loading media…" });
    if (o.signal?.aborted) throw new RenderError("Cancelled.");
  }

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const master = audioCtx.createGain();
  master.connect(dest);
  const scheduled: { clip: TimelineClip; buffer: AudioBuffer; loop: boolean; gain: number }[] = [];
  const audioClips = clips.filter((c) => (c.kind === "voice" || c.kind === "music" || c.kind === "sfx") && !c.muted && !mutedTracks.has(c.trackId));
  let deviceVoices = 0;
  for (const clip of audioClips) {
    const a = o.assetFor(clip.assetId);
    if (!a) continue;
    try {
      if (a.source === "provider-output") {
        scheduled.push({ clip, buffer: await decode(audioCtx, a.payload), loop: clip.kind === "music", gain: clip.kind === "music" ? clip.volume * 0.8 : clip.volume });
      } else if (a.source === "upload-session") {
        if (!a.blobUrl) throw new Error("bytes unavailable");
        scheduled.push({ clip, buffer: await decode(audioCtx, a.blobUrl), loop: clip.kind === "music", gain: clip.kind === "music" ? clip.volume * 0.8 : clip.volume });
      } else if (clip.kind === "music") {
        const recipe = JSON.parse(a.payload) as { mood?: MusicMood; seconds?: number };
        if (recipe.mood) scheduled.push({ clip, buffer: renderMusic(musicRecipe(recipe.mood, recipe.seconds ?? 30)).buffer, loop: true, gain: clip.volume * 0.8 });
      } else if (clip.kind === "sfx") {
        const recipe = JSON.parse(a.payload) as { type?: SfxType };
        if (recipe.type) scheduled.push({ clip, buffer: renderSfx({ type: recipe.type, seconds: 3 }).buffer, loop: false, gain: clip.volume });
      } else if (clip.kind === "voice") {
        deviceVoices++;
      }
    } catch {
      warnings.push(`Audio “${clip.name}” couldn't be loaded and was left out.`);
    }
  }
  if (deviceVoices) {
    warnings.push(`${deviceVoices} voice clip(s) use your device's built-in voice, which browsers can't record. Generate those takes with Gemini in the Voice studio to include them.`);
  }
  o.onProgress({ phase: "preparing", ratio: 1, message: "Starting render…" });

  // ---- 2. Canvas + recorder. ----
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new RenderError("Canvas unavailable.");
  const stream = canvas.captureStream(o.fps);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  const bitrate = Math.round(W * H * o.fps * 0.14); // ~8.7 Mbps at 1080p30
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 });
  } catch {
    throw new RenderError("The browser refused to start recording. If you used images from another site, re-generate or re-upload them.");
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  if (audioCtx.state === "suspended") await audioCtx.resume();
  const t0 = audioCtx.currentTime + 0.15;
  for (const s of scheduled) {
    const src = audioCtx.createBufferSource();
    src.buffer = s.buffer;
    src.loop = s.loop;
    const g = audioCtx.createGain();
    const start = t0 + s.clip.startSec;
    const end = start + Math.min(s.clip.durationSec, o.duration - s.clip.startSec);
    g.gain.setValueAtTime(s.clip.fadeInSec > 0 ? 0 : s.gain, start);
    if (s.clip.fadeInSec > 0) g.gain.linearRampToValueAtTime(s.gain, start + s.clip.fadeInSec);
    if (s.clip.fadeOutSec > 0) {
      g.gain.setValueAtTime(s.gain, Math.max(start, end - s.clip.fadeOutSec));
      g.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(g).connect(master);
    src.start(start);
    src.stop(end);
  }

  const fontScale = W / 672; // the preview box is ~672px wide
  const drawFrame = (t: number) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const active = clips.filter((c) => t >= c.startSec && t < c.startSec + c.durationSec);
    const visual = active.find((c) => c.kind === "image" || c.kind === "video");
    if (visual) {
      const el = visual.assetId ? visuals.get(visual.assetId) : undefined;
      ctx.save();
      ctx.globalAlpha = fadeFactor(visual, t);
      if (el instanceof HTMLVideoElement) {
        const want = Math.max(0, t - visual.startSec);
        if (el.paused) void el.play().catch(() => {});
        if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = Math.min(want, Math.max(0, (el.duration || want) - 0.05));
        if (el.videoWidth) drawContain(ctx, el, el.videoWidth, el.videoHeight, W, H, { scale: 1, dx: 0, dy: 0 }, false);
      } else if (el) {
        const p = Math.min(1, (t - visual.startSec) / Math.max(0.1, Math.min(visual.durationSec, 10)));
        const isDraft = o.assetFor(visual.assetId)?.source === "local-draft";
        drawContain(ctx, el, el.naturalWidth || W, el.naturalHeight || H, W, H, motionTransform(visual.motion, p), isDraft);
      } else {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, W, H);
        drawTextBox(ctx, visual.name, { fontPx: 28 * fontScale, weight: 600, font: "", color: "#e4e4e7", background: "transparent", align: "center", y: H / 2, anchor: "middle", W, opacity: 1 });
      }
      ctx.restore();
    }
    // Pause videos that are no longer on screen.
    for (const [id, el] of visuals) if (el instanceof HTMLVideoElement && visual?.assetId !== id && !el.paused) el.pause();

    for (const tc of active.filter((c) => c.kind === "text" && c.text)) {
      const st: Partial<TextStyle> = tc.style ?? {};
      const fontPx = Math.max(12, (st.size ?? 32) / 2.4) * fontScale;
      const pos = st.position ?? "bottom";
      drawTextBox(ctx, tc.text!, {
        fontPx,
        weight: st.weight ?? 600,
        font: st.font ?? "",
        color: st.color ?? "#fff",
        background: st.background ?? "rgba(0,0,0,0.55)",
        align: (st.align ?? "center") as CanvasTextAlign,
        y: pos === "top" ? 16 * fontScale : pos === "center" ? H / 2 : H - 64 * fontScale,
        anchor: pos === "top" ? "top" : pos === "center" ? "middle" : "bottom",
        W,
        opacity: (st.opacity ?? 1) * fadeFactor(tc, t),
      });
    }
    const caption = [...active.filter((c) => c.kind === "captions" && c.text)].pop();
    if (caption) {
      drawTextBox(ctx, caption.text!, { fontPx: 14 * fontScale, weight: 500, font: "", color: "#fff", background: "rgba(0,0,0,0.7)", align: "center", y: H - 16 * fontScale, anchor: "bottom", W, opacity: 1 });
    }
  };

  // ---- 3. Real-time playback into the recorder. ----
  drawFrame(0);
  recorder.start(1000);
  await new Promise<void>((resolve, reject) => {
    const frameMs = 1000 / o.fps;
    const tick = () => {
      if (o.signal?.aborted) {
        reject(new RenderError("Cancelled."));
        return;
      }
      const t = audioCtx.currentTime - t0;
      if (t >= o.duration) {
        resolve();
        return;
      }
      drawFrame(Math.max(0, t));
      o.onProgress({ phase: "rendering", ratio: Math.max(0, t) / o.duration, message: "Rendering video…" });
      // setTimeout keeps rendering even when the tab is in the background (rAF would stall).
      window.setTimeout(tick, frameMs / 2);
    };
    tick();
  }).finally(() => {
    for (const el of visuals.values()) if (el instanceof HTMLVideoElement) el.pause();
  });

  o.onProgress({ phase: "finalizing", ratio: 1, message: "Finalizing file…" });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  void audioCtx.close();
  const type = mime.split(";")[0];
  const blob = new Blob(chunks, { type });
  if (blob.size < 1000) throw new RenderError("The render produced an empty file. Keep this tab open while rendering and try again.");
  return { blob, mime: type, warnings };
}
