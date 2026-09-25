import type { ClipFilters, Composition, TextStyle, TimelineClip } from "@/src/lib/video/types";
import { IDENTITY_TRANSFORM, NEUTRAL_FILTERS } from "@/src/lib/video/types";
import { normalizeTransition } from "@/src/lib/video/presets";

/**
 * The frame compositor — the single source of truth for what a frame looks
 * like. The live preview and the exporter both call drawComposition(), so
 * what you see while editing is exactly what gets encoded.
 *
 * Layering: tracks draw in list order (later tracks on top), captions last.
 */

export type VisualSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface DrawOptions {
  /** Resolves a clip's decoded visual (image/video element) or null. */
  sourceFor: (clip: TimelineClip) => VisualSource | null;
  /** True for generated SVG drafts, which fill the frame by default. */
  isDraft?: (clip: TimelineClip) => boolean;
  /** Draw thin guides around the selected clip (preview only). */
  selectedId?: string | null;
}

const VISUAL_KINDS = new Set(["video", "image", "text", "captions"]);

export function clipActive(c: TimelineClip, t: number): boolean {
  return t >= c.startSec && t < c.startSec + c.durationSec;
}

/** Source-media time for a clip at timeline time t (in-point, speed, reverse). */
export function sourceTime(c: TimelineClip, t: number, sourceDuration?: number): number {
  const speed = c.speed ?? 1;
  const local = Math.max(0, Math.min(c.durationSec, t - c.startSec));
  const inSec = c.inSec ?? 0;
  if (c.reverse) {
    const end = inSec + c.durationSec * speed;
    const v = end - local * speed;
    return Math.max(0, sourceDuration ? Math.min(v, sourceDuration - 0.04) : v);
  }
  const v = inSec + local * speed;
  return sourceDuration ? Math.min(v, Math.max(0, sourceDuration - 0.04)) : v;
}

const MEDIA_KINDS = new Set(["video", "image"]);

/** Seconds the transition into this clip lasts (0 when it's a cut). */
export function transitionDuration(c: TimelineClip): number {
  if (normalizeTransition(c.transitionIn) === "cut") return 0;
  return Math.max(0.1, Math.min(2, c.durationSec / 2, c.transitionSec ?? 0.6));
}

/** The clip playing right before this one on the same track (touching it), if any. */
export function previousClip(comp: Composition, c: TimelineClip): TimelineClip | null {
  let best: TimelineClip | null = null;
  for (const o of comp.clips) {
    if (o.id === c.id || o.trackId !== c.trackId || !MEDIA_KINDS.has(o.kind)) continue;
    if (Math.abs(o.startSec + o.durationSec - c.startSec) < 0.05) best = o;
  }
  return best;
}

/**
 * Visual clips drawn at t, bottom layer first. During a transition the clip
 * before it stays on screen underneath (held on its last frame) so the two
 * blend instead of dipping through black.
 */
export function visualStack(comp: Composition, t: number): TimelineClip[] {
  const hidden = new Set(comp.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
  const order = new Map(comp.tracks.map((tr, i) => [tr.id, tr.kind === "captions" ? 10_000 + i : i]));
  const active = comp.clips.filter((c) => VISUAL_KINDS.has(c.kind) && !hidden.has(c.trackId) && clipActive(c, t));
  const tails: TimelineClip[] = [];
  for (const c of active) {
    if (!MEDIA_KINDS.has(c.kind)) continue;
    const d = transitionDuration(c);
    if (d <= 0 || t - c.startSec >= d) continue;
    const prev = previousClip(comp, c);
    if (prev && !clipActive(prev, t) && !tails.includes(prev)) tails.push(prev);
  }
  return [...tails, ...active].sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.startSec - b.startSec);
}

export function filterString(f: ClipFilters | undefined, scale: number): string {
  if (!f) return "none";
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur > 0) parts.push(`blur(${(f.blur * scale).toFixed(1)}px)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
}

/** Named looks that set several filters at once. */
export const FILTER_PRESETS: { id: string; label: string; filters: ClipFilters }[] = [
  { id: "none", label: "Original", filters: NEUTRAL_FILTERS },
  { id: "vivid", label: "Vivid", filters: { ...NEUTRAL_FILTERS, contrast: 112, saturation: 135 } },
  { id: "warm", label: "Warm", filters: { ...NEUTRAL_FILTERS, sepia: 22, saturation: 115, brightness: 104 } },
  { id: "cool", label: "Cool", filters: { ...NEUTRAL_FILTERS, hue: 195, saturation: 90, sepia: 10 } },
  { id: "cinematic", label: "Cinematic", filters: { ...NEUTRAL_FILTERS, contrast: 118, saturation: 85, brightness: 96, vignette: 45 } },
  { id: "mono", label: "Mono", filters: { ...NEUTRAL_FILTERS, grayscale: 100, contrast: 115 } },
  { id: "vintage", label: "Vintage", filters: { ...NEUTRAL_FILTERS, sepia: 55, contrast: 90, brightness: 105, vignette: 35 } },
  { id: "fade", label: "Faded", filters: { ...NEUTRAL_FILTERS, contrast: 82, saturation: 80, brightness: 108 } },
  { id: "dramatic", label: "Dramatic", filters: { ...NEUTRAL_FILTERS, contrast: 140, saturation: 110, brightness: 92, vignette: 55 } },
];

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
const easeOut = (x: number) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;

/** Picture animation at progress p (0–1) through the clip; `sec` is seconds into it. */
export function motionAt(motion: string | undefined, p: number, amount = 1, sec = 0): { scale: number; dx: number; dy: number; rot: number } {
  const e = easeInOut(p);
  const a = Math.max(0.25, Math.min(2, amount));
  const still = { scale: 1, dx: 0, dy: 0, rot: 0 };
  switch (motion) {
    case "kenburns":
      return { ...still, scale: 1 + 0.14 * a * e, dx: -0.035 * a * e, dy: -0.02 * a * e };
    case "kenburns-right":
      return { ...still, scale: 1 + 0.14 * a * e, dx: 0.035 * a * e, dy: 0.02 * a * e };
    case "zoom-in":
      return { ...still, scale: 1 + 0.18 * a * e };
    case "zoom-out":
      return { ...still, scale: 1 + 0.18 * a * (1 - e) };
    case "zoom-in-fast":
      return { ...still, scale: 1 + 0.22 * a * easeOut(sec / 0.6) + 0.04 * a * e };
    case "pan-left":
      return { ...still, scale: 1 + 0.14 * a, dx: 0.05 * a * (1 - 2 * e) };
    case "pan-right":
      return { ...still, scale: 1 + 0.14 * a, dx: -0.05 * a * (1 - 2 * e) };
    case "pan-up":
      return { ...still, scale: 1 + 0.14 * a, dy: 0.05 * a * (1 - 2 * e) };
    case "pan-down":
      return { ...still, scale: 1 + 0.14 * a, dy: -0.05 * a * (1 - 2 * e) };
    case "diagonal":
      return { ...still, scale: 1 + 0.16 * a, dx: 0.045 * a * (1 - 2 * e), dy: 0.035 * a * (1 - 2 * e) };
    case "drift":
      return { ...still, scale: 1 + 0.08 * a, dx: 0.022 * a * Math.sin((2 * Math.PI * sec) / 7), dy: 0.016 * a * Math.cos((2 * Math.PI * sec) / 9) };
    case "breathe":
      return { ...still, scale: 1 + 0.03 * a + 0.03 * a * Math.sin((2 * Math.PI * sec) / 4) };
    case "tilt":
      return { ...still, scale: 1 + 0.12 * a, rot: (-2.5 + 5 * e) * a };
    case "rotate":
      return { ...still, scale: 1 + 0.1 * a + 0.05 * a * e, rot: 5 * a * e };
    case "shake":
      return {
        scale: 1 + 0.05 * a,
        dx: 0.005 * a * (Math.sin(sec * 13.1) + Math.sin(sec * 7.3)),
        dy: 0.005 * a * (Math.cos(sec * 11.7) + Math.sin(sec * 5.9)),
        rot: 0.35 * a * Math.sin(sec * 4.3),
      };
    case "pop-in": {
      const q = Math.max(0, Math.min(1, sec / 0.45));
      const back = 1 + 2.2 * (q - 1) ** 3 + 1.2 * (q - 1) ** 2;
      return { ...still, scale: 1 - 0.25 * a + 0.25 * a * back };
    }
    default:
      return still;
  }
}

export interface TransitionFx {
  alpha: number;
  /** Offsets as fractions of the frame. */
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  /** Extra blur in px at 1080p. */
  blur: number;
  /** Frame-space reveal: a rectangle (fractions) or a circle (fraction of the half-diagonal). */
  clip: { kind: "rect"; x0: number; y0: number; x1: number; y1: number } | { kind: "circle"; r: number } | null;
  /** Full-frame colour drawn over everything (dip to black / flash). */
  overlay: { color: string; alpha: number } | null;
}

const NO_FX: TransitionFx = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, clip: null, overlay: null };

/** How the incoming clip looks at progress p (0 → 1) of a transition. */
export function incomingFx(kind: string, p: number): TransitionFx {
  const e = easeOut(p);
  const fx: TransitionFx = { ...NO_FX };
  switch (kind) {
    case "fade":
      fx.alpha = p;
      break;
    case "dip-black":
    case "dip-white":
      fx.alpha = p < 0.5 ? 0 : 1;
      fx.overlay = { color: kind === "dip-black" ? "#000000" : "#ffffff", alpha: 1 - Math.abs(2 * p - 1) };
      break;
    case "slide-left":
    case "push-left":
      fx.dx = 1 - e;
      break;
    case "slide-right":
    case "push-right":
      fx.dx = -(1 - e);
      break;
    case "slide-up":
      fx.dy = 1 - e;
      break;
    case "slide-down":
      fx.dy = -(1 - e);
      break;
    case "zoom-in":
      fx.scale = 1 + 0.45 * (1 - e);
      fx.alpha = Math.min(1, p * 1.6);
      break;
    case "zoom-out":
      fx.scale = 0.5 + 0.5 * e;
      fx.alpha = Math.min(1, p * 1.6);
      break;
    case "wipe-left":
      fx.clip = { kind: "rect", x0: 1 - e, y0: 0, x1: 1, y1: 1 };
      break;
    case "wipe-right":
      fx.clip = { kind: "rect", x0: 0, y0: 0, x1: e, y1: 1 };
      break;
    case "wipe-up":
      fx.clip = { kind: "rect", x0: 0, y0: 1 - e, x1: 1, y1: 1 };
      break;
    case "wipe-down":
      fx.clip = { kind: "rect", x0: 0, y0: 0, x1: 1, y1: e };
      break;
    case "circle":
      fx.clip = { kind: "circle", r: e };
      break;
    case "blur":
      fx.alpha = p;
      fx.blur = 24 * (1 - p);
      break;
    case "spin":
      fx.alpha = Math.min(1, p * 1.5);
      fx.rot = -120 * (1 - e);
      fx.scale = 0.35 + 0.65 * e;
      break;
  }
  return fx;
}

/** How the outgoing clip (held underneath) moves while the next one comes in. */
export function outgoingFx(kind: string, p: number): TransitionFx {
  const e = easeOut(p);
  if (kind === "push-left") return { ...NO_FX, dx: -e };
  if (kind === "push-right") return { ...NO_FX, dx: e };
  if (kind === "blur") return { ...NO_FX, blur: 24 * p };
  if (kind === "zoom-in") return { ...NO_FX, scale: 1 + 0.25 * e };
  return NO_FX;
}

function merge(a: TransitionFx, b: TransitionFx): TransitionFx {
  return {
    alpha: a.alpha * b.alpha,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scale: a.scale * b.scale,
    rot: a.rot + b.rot,
    blur: a.blur + b.blur,
    clip: b.clip ?? a.clip,
    overlay: b.overlay ?? a.overlay,
  };
}

/** Fades plus the transition into and out of a clip at time t (its own window only). */
export function transitionState(c: TimelineClip, t: number): TransitionFx {
  const local = t - c.startSec;
  const out = c.startSec + c.durationSec - t;
  let fx: TransitionFx = { ...NO_FX };
  if (c.fadeInSec > 0) fx.alpha = Math.min(fx.alpha, Math.max(0, local / c.fadeInSec));
  if (c.fadeOutSec > 0) fx.alpha = Math.min(fx.alpha, Math.max(0, out / c.fadeOutSec));
  const inKind = normalizeTransition(c.transitionIn);
  const d = transitionDuration(c);
  if (inKind !== "cut" && d > 0 && local < d) fx = merge(fx, incomingFx(inKind, Math.max(0, local / d)));
  const outKind = normalizeTransition(c.transitionOut);
  const dOut = Math.max(0.1, Math.min(2, c.durationSec / 2, c.transitionSec ?? 0.6));
  if (outKind !== "cut" && out < dOut) {
    // Leaving: play the entrance backwards (a slide leaves the way it would arrive, mirrored).
    const o = incomingFx(outKind, Math.max(0, out / dOut));
    fx = merge(fx, { ...o, dx: -o.dx, dy: -o.dy });
  }
  fx.alpha = Math.max(0, Math.min(1, fx.alpha));
  return fx;
}

function sourceSize(src: VisualSource): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth || 1, h: src.videoHeight || 1 };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth || 1, h: src.naturalHeight || 1 };
  return { w: src.width || 1, h: src.height || 1 };
}

/** Default fit when the user hasn't chosen one (shared with the inspector). */
export function defaultFit(clip: Pick<TimelineClip, "fit" | "kind">, draft = false): "contain" | "cover" | "fill" {
  return clip.fit ?? (draft ? "cover" : "contain");
}

/** Background mode "blur": the frame behind media is a blurred, dimmed copy of it (CapCut-style). */
export const BLUR_BACKGROUND = "blur";

/** Fill the frame with a blurred cover-scaled copy of the source. */
function drawBlurBackdrop(ctx: CanvasRenderingContext2D, src: VisualSource, W: number, H: number) {
  const { w, h } = sourceSize(src);
  const k = Math.max(W / w, H / h) * 1.08;
  ctx.save();
  ctx.filter = `blur(${Math.round(W / 45)}px) brightness(0.62) saturate(1.15)`;
  ctx.drawImage(src, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
  ctx.restore();
}

function drawMedia(
  ctx: CanvasRenderingContext2D,
  src: VisualSource,
  clip: TimelineClip,
  t: number,
  W: number,
  H: number,
  draft: boolean,
  fx: TransitionFx,
): void {
  const { w: sw, h: sh } = sourceSize(src);
  const crop = clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cx = sw * crop.left;
  const cy = sh * crop.top;
  const cw = Math.max(1, sw * (1 - crop.left - crop.right));
  const ch = Math.max(1, sh * (1 - crop.top - crop.bottom));
  const fit = defaultFit(clip, draft);
  let dw = W;
  let dh = H;
  if (fit !== "fill") {
    const k = fit === "cover" ? Math.max(W / cw, H / ch) : Math.min(W / cw, H / ch);
    dw = cw * k;
    dh = ch * k;
  }
  const tr = clip.transform ?? IDENTITY_TRANSFORM;
  const sec = Math.max(0, t - clip.startSec);
  const p = Math.min(1, sec / Math.max(0.1, clip.durationSec));
  const m = motionAt(clip.motion, p, clip.motionAmount ?? 1, sec);
  if (fx.alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha *= (clip.opacity ?? 1) * fx.alpha;
  if (fx.clip) {
    ctx.beginPath();
    if (fx.clip.kind === "rect") ctx.rect(fx.clip.x0 * W, fx.clip.y0 * H, (fx.clip.x1 - fx.clip.x0) * W, (fx.clip.y1 - fx.clip.y0) * H);
    else ctx.arc(W / 2, H / 2, Math.max(0.5, (fx.clip.r * Math.hypot(W, H)) / 2), 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.translate(W / 2 + (tr.x + m.dx + fx.dx) * W, H / 2 + (tr.y + m.dy + fx.dy) * H);
  ctx.rotate(((tr.rotation + m.rot + fx.rot) * Math.PI) / 180);
  const s = tr.scale * m.scale * fx.scale;
  ctx.scale(s * (tr.flipH ? -1 : 1), s * (tr.flipV ? -1 : 1));
  const filters = clip.filters;
  const base = filterString(filters, W / 1920);
  const extra = fx.blur > 0.2 ? `blur(${((fx.blur * W) / 1920).toFixed(1)}px)` : "";
  ctx.filter = extra ? (base === "none" ? extra : `${base} ${extra}`) : base;
  ctx.drawImage(src, cx, cy, cw, ch, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = "none";
  if (filters?.vignette) {
    const g = ctx.createRadialGradient(0, 0, Math.min(dw, dh) * 0.25, 0, 0, Math.hypot(dw, dh) / 2);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, filters.vignette / 100)})`);
    ctx.fillStyle = g;
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();
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
    lines.push(line);
  }
  return lines;
}

export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: { fontPx: number; weight: number; font: string; color: string; background: string; align: "left" | "center" | "right"; x: number; y: number; anchor: "top" | "middle" | "bottom"; W: number; stroke?: boolean },
) {
  ctx.font = `${o.weight} ${o.fontPx}px ${o.font || "Inter, system-ui, sans-serif"}`;
  ctx.textBaseline = "middle";
  const padX = o.fontPx * 0.45;
  const padY = o.fontPx * 0.16;
  const lineH = o.fontPx * 1.22;
  const lines = wrapLines(ctx, text, o.W * 0.86);
  const blockH = lines.length * lineH;
  let top = o.anchor === "top" ? o.y : o.anchor === "middle" ? o.y - blockH / 2 : o.y - blockH;
  for (const line of lines) {
    const tw = ctx.measureText(line).width;
    const x = o.align === "left" ? o.x - o.W * 0.45 : o.align === "right" ? o.x + o.W * 0.45 - tw : o.x - tw / 2;
    if (o.background && o.background !== "transparent" && line) {
      ctx.fillStyle = o.background;
      ctx.beginPath();
      ctx.roundRect(x - padX, top + (lineH - o.fontPx) / 2 - padY, tw + padX * 2, o.fontPx + padY * 2, o.fontPx * 0.28);
      ctx.fill();
    }
    if (o.stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, o.fontPx * 0.09);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(line, x, top + lineH / 2);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(line, x, top + lineH / 2);
    top += lineH;
  }
  return { top: top - blockH, height: blockH };
}

/** Text + sticker clips with entrance animation. */
function drawText(ctx: CanvasRenderingContext2D, clip: TimelineClip, t: number, W: number, H: number) {
  if (!clip.text) return;
  const st: Partial<TextStyle> = clip.style ?? {};
  const unit = textUnit(W, H); // style sizes are authored against the ~672px preview box
  const fontPx = Math.max(10, (st.size ?? 32) / 2.4) * unit;
  const pos = st.position ?? "bottom";
  const tr = clip.transform ?? IDENTITY_TRANSFORM;
  const local = t - clip.startSec;
  const anim = clip.textAnim ?? "none";
  const inP = Math.min(1, local / 0.6);
  const ease = 1 - (1 - inP) ** 3;
  const ts = transitionState(clip, t);
  let text = clip.text;
  let dy = 0;
  let scale = 1;
  let alpha = (st.opacity ?? 1) * (clip.opacity ?? 1) * ts.alpha;
  if (anim === "fade") alpha *= ease;
  if (anim === "slide-up") {
    alpha *= ease;
    dy = (1 - ease) * 40 * unit;
  }
  if (anim === "pop") scale = inP < 1 ? 0.6 + 0.4 * (1 - (1 - inP) ** 3) * (1 + 0.12 * Math.sin(inP * Math.PI)) : 1;
  if (anim === "typewriter") text = clip.text.slice(0, Math.ceil(clip.text.length * Math.min(1, local / Math.max(0.6, Math.min(2.5, clip.text.length * 0.05)))));
  const baseY = pos === "top" ? 20 * unit : pos === "center" ? H / 2 : H - 60 * unit;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  const ox = W / 2 + (tr.x + ts.dx) * W;
  const oy = baseY + (tr.y + ts.dy) * H + dy;
  ctx.translate(ox, oy);
  ctx.rotate((tr.rotation * Math.PI) / 180);
  ctx.scale(scale * tr.scale, scale * tr.scale);
  if (anim === "wipe" && inP < 1) {
    ctx.beginPath();
    ctx.rect(-W / 2, -H, W * ease, H * 2);
    ctx.clip();
  }
  drawTextBlock(ctx, text, {
    fontPx,
    weight: st.weight ?? 600,
    font: st.font ?? "",
    color: st.color ?? "#fff",
    background: st.background ?? "rgba(0,0,0,0.55)",
    align: st.align ?? "center",
    x: 0,
    y: 0,
    anchor: pos === "top" ? "top" : pos === "center" ? "middle" : "bottom",
    W,
    stroke: (st.background ?? "") === "transparent",
  });
  ctx.restore();
}

/**
 * Text scale from the frame's shorter side: identical to the old
 * width-based size on 16:9, and full-size (not half-size) on 9:16 Shorts.
 */
export function textUnit(W: number, H: number): number {
  return Math.min(W, H) / 378;
}

function drawCaption(ctx: CanvasRenderingContext2D, clip: TimelineClip, W: number, H: number) {
  if (!clip.text) return;
  const unit = textUnit(W, H);
  const st: Partial<TextStyle> = clip.style ?? {};
  drawTextBlock(ctx, clip.text, {
    fontPx: Math.max(10, (st.size ?? 34) / 2.4) * unit,
    weight: st.weight ?? 600,
    font: st.font ?? "",
    color: st.color ?? "#fff",
    background: st.background ?? "rgba(0,0,0,0.72)",
    align: "center",
    x: W / 2,
    y: H - 18 * unit,
    anchor: "bottom",
    W,
  });
}

/** Paint one full frame of the composition at timeline time t. */
export function drawComposition(ctx: CanvasRenderingContext2D, comp: Composition, t: number, W: number, H: number, o: DrawOptions): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  const bg = comp.canvas.background ?? BLUR_BACKGROUND;
  ctx.fillStyle = bg === BLUR_BACKGROUND ? "#000000" : bg || "#000000";
  ctx.fillRect(0, 0, W, H);
  let backdropDone = bg !== BLUR_BACKGROUND;
  const overlays: { color: string; alpha: number }[] = [];
  for (const clip of visualStack(comp, t)) {
    if (clip.kind === "text") drawText(ctx, clip, t, W, H);
    else if (clip.kind === "captions") drawCaption(ctx, clip, W, H);
    else {
      const src = o.sourceFor(clip);
      if (!src) continue;
      // Bottom media layer: fill empty frame space with its own blurred copy.
      if (!backdropDone) {
        drawBlurBackdrop(ctx, src, W, H);
        backdropDone = true;
      }
      let fx: TransitionFx;
      if (clipActive(clip, t)) fx = transitionState(clip, t);
      else {
        // Held underneath the next clip while it transitions in.
        const next = comp.clips.find((n) => n.trackId === clip.trackId && n.id !== clip.id && Math.abs(n.startSec - (clip.startSec + clip.durationSec)) < 0.05 && clipActive(n, t));
        const d = next ? transitionDuration(next) : 0;
        fx = next && d > 0 ? outgoingFx(normalizeTransition(next.transitionIn), (t - next.startSec) / d) : NO_FX;
      }
      drawMedia(ctx, src, clip, t, W, H, o.isDraft?.(clip) ?? false, fx);
      if (fx.overlay && fx.overlay.alpha > 0) overlays.push(fx.overlay);
    }
  }
  for (const ov of overlays) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, ov.alpha);
    ctx.fillStyle = ov.color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();
}

/** Visual clips whose media must be loaded to draw time t. */
export function mediaClipsAt(comp: Composition, t: number): TimelineClip[] {
  return visualStack(comp, t).filter((c) => c.kind === "video" || c.kind === "image");
}
