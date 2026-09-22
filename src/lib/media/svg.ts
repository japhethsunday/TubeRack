/**
 * Deterministic SVG draft engine — Phase 7.
 * Real on-device visual drafts: seeded compositions from style presets,
 * aspect ratios, and the creator's title text. Layout drafts for planning,
 * comparison, and scene assignment — never presented as AI photography.
 */

export type PosterAspect = "16:9" | "9:16" | "1:1";

export const POSTER_DIMS: Record<PosterAspect, { width: number; height: number }> = {
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 540, height: 960 },
  "1:1": { width: 720, height: 720 },
};

export interface PosterStyle {
  id: string;
  label: string;
  blurb: string;
  background: [string, string];
  accent: string;
  ink: string;
  muted: string;
}

export const POSTER_STYLES: PosterStyle[] = [
  { id: "neon", label: "Neon", blurb: "Dark stage, electric accent.", background: ["#0b0b12", "#1b1035"], accent: "#22d3ee", ink: "#f8fafc", muted: "#64748b" },
  { id: "paper", label: "Paper", blurb: "Warm editorial minimal.", background: ["#faf6ef", "#e8ddc9"], accent: "#b45309", ink: "#1c1917", muted: "#78716c" },
  { id: "mono", label: "Mono", blurb: "High-contrast black and white.", background: ["#fafafa", "#d4d4d4"], accent: "#18181b", ink: "#09090b", muted: "#71717a" },
  { id: "sunset", label: "Sunset", blurb: "Warm gradient energy.", background: ["#431407", "#9a3412"], accent: "#fdba74", ink: "#fff7ed", muted: "#d6a682" },
  { id: "ocean", label: "Ocean", blurb: "Cool documentary calm.", background: ["#082f49", "#0c4a6e"], accent: "#7dd3fc", ink: "#f0f9ff", muted: "#7fa8c4" },
  { id: "forest", label: "Forest", blurb: "Grounded natural tones.", background: ["#052e16", "#14532d"], accent: "#86efac", ink: "#f0fdf4", muted: "#7ca88f" },
];

export function styleById(id: string): PosterStyle {
  return POSTER_STYLES.find((s) => s.id === id) ?? POSTER_STYLES[0];
}

/** Seeded PRNG: same inputs always render the same draft. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface PosterInput {
  seed: number;
  title: string;
  styleId: string;
  aspect: PosterAspect;
  mood?: string;
}

/** Build the draft SVG markup. Pure, deterministic, title-escaped. */
export function buildPoster(input: PosterInput): string {
  const style = styleById(input.styleId);
  const { width, height } = POSTER_DIMS[input.aspect];
  const rand = mulberry32(input.seed);
  const gid = `g${Math.abs(input.seed) % 100000}`;

  const circles = Array.from({ length: 3 }, (_, i) => {
    const cx = Math.round(rand() * width);
    const cy = Math.round(rand() * height);
    const r = Math.round(40 + rand() * Math.min(width, height) * 0.28);
    const op = (0.08 + rand() * 0.12).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${style.accent}" opacity="${op}" data-i="${i}"/>`;
  }).join("");

  const bars = Array.from({ length: 4 }, (_, i) => {
    const bw = Math.round(width * (0.04 + rand() * 0.1));
    const x = Math.round(rand() * (width - bw));
    return `<rect x="${x}" y="0" width="${bw}" height="${height}" fill="${style.accent}" opacity="0.05" data-i="${i}"/>`;
  }).join("");

  const title = input.title.trim() || "Untitled draft";
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > 22 || lines.length >= 2) {
      if (current) lines.push(current.trim());
      current = w;
      if (lines.length >= 3) break;
    } else {
      current = `${current} ${w}`;
    }
  }
  if (current && lines.length < 3) lines.push(current.trim());
  const shown = lines.slice(0, 3);
  const overflow = words.join(" ").length > shown.join(" ").length;

  const fontSize = input.aspect === "9:16" ? 44 : 56;
  const lineHeight = fontSize * 1.15;
  const startY = Math.round(height * 0.42);
  const textEls = shown
    .map((line, i) => `<text x="48" y="${Math.round(startY + i * lineHeight)}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="${style.ink}">${escapeXml(line)}${i === shown.length - 1 && overflow ? "…" : ""}</text>`)
    .join("");

  const mood = input.mood?.trim() ? `<text x="48" y="${Math.round(startY - 40)}" font-family="system-ui, sans-serif" font-size="20" letter-spacing="4" fill="${style.muted}">${escapeXml(input.mood.trim().toUpperCase().slice(0, 28))}</text>` : "";
  const badge = `<text x="48" y="${height - 36}" font-family="system-ui, sans-serif" font-size="16" fill="${style.muted}">LOCAL DRAFT · SEED ${input.seed}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Draft visual: ${escapeXml(title.slice(0, 80))}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${style.background[0]}"/><stop offset="1" stop-color="${style.background[1]}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#${gid})"/>${bars}${circles}${mood}${textEls}${badge}</svg>`;
}

/** Stable seed from text: variations derive seed + n. */
export function seedFromText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 90000 + 1000;
}
