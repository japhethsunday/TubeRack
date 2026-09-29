"use client";

import { directMediaUrl } from "@/src/lib/media/resolve";

/**
 * Brand images drawn in the browser with the real logo file (never redrawn
 * by AI): YouTube banner 2560×1440 (logo and text inside the 1546×423 safe
 * area that shows on every device), profile picture 800×800, watermark 150×150.
 */

export const COLORS = ["#d946ef", "#7c3aed", "#0ea5e9", "#0b0714"] as const;

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image couldn't be loaded."));
    void directMediaUrl(src).then((direct) => {
      img.src = direct;
    });
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  return { c, ctx };
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  ctx.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
}

function brandBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = COLORS[3];
  ctx.fillRect(0, 0, w, h);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${color}aa`);
    g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  glow(w * 0.2, h * 0.3, w * 0.45, COLORS[0]);
  glow(w * 0.55, h * 0.75, w * 0.45, COLORS[1]);
  glow(w * 0.85, h * 0.25, w * 0.4, COLORS[2]);
}

function roundedLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, x: number, y: number, size: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = size * 0.18;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.clip();
  ctx.drawImage(logo, x, y, size, size);
  ctx.restore();
}

export async function drawBanner(opts: { logo: HTMLImageElement; art: HTMLImageElement | null; name: string; tagline: string; site: string }): Promise<HTMLCanvasElement> {
  const W = 2560;
  const H = 1440;
  const { c, ctx } = canvas(W, H);
  if (opts.art) {
    cover(ctx, opts.art, W, H);
    ctx.fillStyle = "rgba(11,7,20,0.45)";
    ctx.fillRect(0, 0, W, H);
  } else brandBackground(ctx, W, H);
  // Soft dark band behind the safe area keeps the text readable on any art.
  const band = ctx.createLinearGradient(0, H / 2 - 320, 0, H / 2 + 320);
  band.addColorStop(0, "rgba(11,7,20,0)");
  band.addColorStop(0.5, "rgba(11,7,20,0.55)");
  band.addColorStop(1, "rgba(11,7,20,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, H / 2 - 320, W, 640);

  const safeW = 1546;
  const logoSize = 250;
  ctx.font = "800 150px system-ui, -apple-system, Segoe UI, sans-serif";
  const nameW = ctx.measureText(opts.name).width;
  ctx.font = "600 64px system-ui, -apple-system, Segoe UI, sans-serif";
  const tagW = ctx.measureText(opts.tagline).width;
  ctx.font = "800 150px system-ui, -apple-system, Segoe UI, sans-serif";
  const gap = 56;
  // Centre the whole block (logo + the widest line) inside the safe area.
  const blockW = Math.min(safeW, logoSize + gap + Math.max(nameW, tagW));
  const x0 = (W - blockW) / 2;
  roundedLogo(ctx, opts.logo, x0, H / 2 - logoSize / 2 - 30, logoSize);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(opts.name, x0 + logoSize + gap, H / 2 - 70, safeW - logoSize - gap);
  ctx.font = "600 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(opts.tagline, x0 + logoSize + gap, H / 2 + 40, safeW - logoSize - gap);
  ctx.font = "600 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#c4b5fd";
  ctx.fillText(opts.site.replace(/^https?:\/\//, ""), x0 + logoSize + gap, H / 2 + 120, safeW - logoSize - gap);
  return c;
}

export function drawProfile(logo: HTMLImageElement): HTMLCanvasElement {
  const { c, ctx } = canvas(800, 800);
  brandBackground(ctx, 800, 800);
  roundedLogo(ctx, logo, 150, 150, 500);
  return c;
}

export function drawWatermark(logo: HTMLImageElement): HTMLCanvasElement {
  const { c, ctx } = canvas(150, 150);
  roundedLogo(ctx, logo, 0, 0, 150);
  return c;
}

export function toBlob(c: HTMLCanvasElement, type: "image/png" | "image/jpeg", q = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), type, q));
}

/** YouTube's banner upload must be under 6 MB (our upload limit is 4 MB). */
export async function bannerJpeg(c: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.9, 0.8, 0.7, 0.6]) {
    const b = await toBlob(c, "image/jpeg", q);
    if (b.size < 4 * 1024 * 1024) return b;
  }
  throw new Error("Could not compress the banner under 4 MB.");
}
