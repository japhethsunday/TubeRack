import type { ClipFilters, Composition, TextStyle, TimelineClip } from "@/src/lib/video/types";
import { IDENTITY_TRANSFORM, NEUTRAL_FILTERS } from "@/src/lib/video/types";

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

/** Visual clips active at t, bottom layer first. */
export function visualStack(comp: Composition, t: number): TimelineClip[] {
  const hidden = new Set(comp.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
  const order = new Map(comp.tracks.map((tr, i) => [tr.id, tr.kind === "captions" ? 10_000 + i : i]));
  return comp.clips
    .filter((c) => VISUAL_KINDS.has(c.kind) && !hidden.has(c.trackId) && clipActive(c, t))
    .sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.startSec - b.startSec);
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

function motionAt(motion: string | undefined, p: number): { scale: number; dx: number; dy: number } {
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

const TRANSITION_SEC = 0.5;

/** Opacity + geometric offsets from fades and in/out transitions. */
export function transitionState(c: TimelineClip, t: number): { alpha: number; dx: number; scale: number; wipe: number } {
  const local = t - c.startSec;
  const out = c.startSec + c.durationSec - t;
  let alpha = 1;
  let dx = 0;
  let scale = 1;
  let wipe = 1;
  if (c.fadeInSec > 0) alpha = Math.min(alpha, local / c.fadeInSec);
  if (c.fadeOutSec > 0) alpha = Math.min(alpha, out / c.fadeOutSec);
  const tin = c.transitionIn && c.transitionIn !== "cut" ? Math.min(1, local / TRANSITION_SEC) : 1;
  const tout = c.transitionOut && c.transitionOut !== "cut" ? Math.min(1, out / TRANSITION_SEC) : 1;
  const ease = (x: number) => 1 - (1 - x) ** 3;
  for (const [kind, p, dir] of [[c.transitionIn, tin, -1], [c.transitionOut, tout, 1]] as const) {
    if (!kind || kind === "cut" || p >= 1) continue;
    if (kind === "fade" || kind === "dissolve") alpha = Math.min(alpha, p);
    else if (kind === "slide") dx += dir * (1 - ease(p));
    else if (kind === "zoom") {
      scale *= 1 + (1 - ease(p)) * 0.35;
      alpha = Math.min(alpha, p);
    } else if (kind === "wipe") wipe = Math.min(wipe, ease(p));
  }
  return { alpha: Math.max(0, Math.min(1, alpha)), dx, scale, wipe };
}

function sourceSize(src: VisualSource): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth || 1, h: src.videoHeight || 1 };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth || 1, h: src.naturalHeight || 1 };
  return { w: src.width || 1, h: src.height || 1 };
}

function drawMedia(ctx: CanvasRenderingContext2D, src: VisualSource, clip: TimelineClip, t: number, W: number, H: number, draft: boolean) {
  const { w: sw, h: sh } = sourceSize(src);
  const crop = clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cx = sw * crop.left;
  const cy = sh * crop.top;
  const cw = Math.max(1, sw * (1 - crop.left - crop.right));
  const ch = Math.max(1, sh * (1 - crop.top - crop.bottom));
  const fit = clip.fit ?? (draft ? "cover" : "contain");
  let dw = W;
  let dh = H;
  if (fit !== "fill") {
    const k = fit === "cover" ? Math.max(W / cw, H / ch) : Math.min(W / cw, H / ch);
    dw = cw * k;
    dh = ch * k;
  }
  const tr = clip.transform ?? IDENTITY_TRANSFORM;
  const p = Math.min(1, (t - clip.startSec) / Math.max(0.1, Math.min(clip.durationSec, 10)));
  const m = clip.kind === "image" ? motionAt(clip.motion, p) : { scale: 1, dx: 0, dy: 0 };
  const ts = transitionState(clip, t);

  ctx.save();
  ctx.globalAlpha *= (clip.opacity ?? 1) * ts.alpha;
  ctx.translate(W / 2 + (tr.x + m.dx + ts.dx) * W, H / 2 + (tr.y + m.dy) * H);
  ctx.rotate((tr.rotation * Math.PI) / 180);
  const s = tr.scale * m.scale * ts.scale;
  ctx.scale(s * (tr.flipH ? -1 : 1), s * (tr.flipV ? -1 : 1));
  if (ts.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-dw / 2, -dh / 2, dw * ts.wipe, dh);
    ctx.clip();
  }
  const filters = clip.filters;
  ctx.filter = filterString(filters, W / 1920);
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
  const unit = W / 672; // style sizes are authored against the ~672px preview box
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
  const oy = baseY + tr.y * H + dy;
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

function drawCaption(ctx: CanvasRenderingContext2D, clip: TimelineClip, W: number, H: number) {
  if (!clip.text) return;
  const unit = W / 672;
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
  ctx.fillStyle = comp.canvas.background || "#000000";
  ctx.fillRect(0, 0, W, H);
  for (const clip of visualStack(comp, t)) {
    if (clip.kind === "text") drawText(ctx, clip, t, W, H);
    else if (clip.kind === "captions") drawCaption(ctx, clip, W, H);
    else {
      const src = o.sourceFor(clip);
      if (src) drawMedia(ctx, src, clip, t, W, H, o.isDraft?.(clip) ?? false);
    }
  }
  ctx.restore();
}

/** Visual clips whose media must be loaded to draw time t. */
export function mediaClipsAt(comp: Composition, t: number): TimelineClip[] {
  return visualStack(comp, t).filter((c) => c.kind === "video" || c.kind === "image");
}
