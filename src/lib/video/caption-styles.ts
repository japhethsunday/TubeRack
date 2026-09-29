/**
 * Caption styles: ten professional looks with their own animation. The same
 * drawing code runs in the live preview and the export, so what you see is
 * what you get. Each video uses one style (chosen in the studio, or picked
 * from the project so different videos don't all look alike).
 */
export type CaptionStyleId =
  | "clean"
  | "karaoke"
  | "highlight"
  | "pop"
  | "boxed"
  | "bold-yellow"
  | "neon"
  | "minimal"
  | "gradient-bar"
  | "cinematic";

export interface CaptionStyleInfo {
  id: CaptionStyleId;
  label: string;
  blurb: string;
}

export const CAPTION_STYLES: CaptionStyleInfo[] = [
  { id: "clean", label: "Clean", blurb: "Bold white with a soft outline; fades up." },
  { id: "karaoke", label: "Karaoke", blurb: "Each word lights up as it's spoken." },
  { id: "highlight", label: "Highlight", blurb: "The spoken word sits on a colour box." },
  { id: "pop", label: "Word pop", blurb: "Words pop in one by one." },
  { id: "boxed", label: "Boxed", blurb: "White text on a rounded dark card; slides up." },
  { id: "bold-yellow", label: "Bold yellow", blurb: "Heavy yellow capitals with a punchy bounce." },
  { id: "neon", label: "Neon", blurb: "Glowing cyan with a gentle pulse." },
  { id: "minimal", label: "Minimal", blurb: "Smaller, lighter text; calm fade." },
  { id: "gradient-bar", label: "Gradient bar", blurb: "Text on a brand gradient bar that wipes in." },
  { id: "cinematic", label: "Cinematic", blurb: "Spaced capitals with a slow fade." },
];

const IDS = CAPTION_STYLES.map((s) => s.id);

export function isCaptionStyle(v: unknown): v is CaptionStyleId {
  return typeof v === "string" && (IDS as string[]).includes(v);
}

/** The style for a video: the chosen one, or one picked from the project id (stable, varied). */
export function captionStyleFor(projectId: string, chosen?: string): CaptionStyleId {
  if (isCaptionStyle(chosen)) return chosen;
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) >>> 0;
  return IDS[h % IDS.length];
}

interface Word {
  text: string;
  w: number;
  line: number;
  x: number;
}

const ease = (p: number) => 1 - (1 - Math.max(0, Math.min(1, p))) ** 3;
const back = (p: number) => {
  const x = Math.max(0, Math.min(1, p));
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** Lay words into centred lines no wider than maxW. */
function layout(ctx: CanvasRenderingContext2D, words: string[], maxW: number, space: number): { words: Word[]; lines: number; widths: number[] } {
  const out: Word[] = [];
  const widths: number[] = [];
  let line = 0;
  let cur = 0;
  for (const text of words) {
    const w = ctx.measureText(text).width;
    if (cur > 0 && cur + space + w > maxW) {
      widths[line] = cur;
      line++;
      cur = 0;
    }
    out.push({ text, w, line, x: cur === 0 ? 0 : cur + space });
    cur = cur === 0 ? w : cur + space + w;
  }
  widths[line] = cur;
  return { words: out, lines: line + 1, widths };
}

/**
 * Draw one caption line-group at time t. `local` is seconds since the caption
 * started, `dur` its length. Words are timed evenly across the caption.
 */
export function drawStyledCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: CaptionStyleId,
  o: { local: number; dur: number; W: number; H: number; unit: number; sizeScale?: number; color?: string },
): void {
  const vertical = o.H > o.W;
  const upper = style === "bold-yellow" || style === "cinematic";
  const raw = (upper ? text.toUpperCase() : text).split(/\s+/).filter(Boolean);
  if (!raw.length) return;
  const base = (style === "minimal" ? 16 : style === "cinematic" ? 17 : style === "bold-yellow" || style === "pop" ? 24 : 22) * (o.sizeScale ?? 1) * o.unit;
  const weight = style === "minimal" || style === "cinematic" ? 600 : 800;
  const font = `${weight} ${base}px Inter, system-ui, sans-serif`;
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = "middle";
  if (style === "cinematic" && "letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(base * 0.18)}px`;
  const space = ctx.measureText(" ").width * (style === "cinematic" ? 1.6 : 1);
  const { words, lines, widths } = layout(ctx, raw, o.W * (vertical ? 0.84 : 0.72), space);
  const lineH = base * 1.3;
  const blockH = lines * lineH;
  const bottom = o.H - (vertical ? o.H * 0.2 : o.H * 0.1);
  const top = bottom - blockH;
  const n = words.length;
  const per = Math.max(0.12, o.dur / n);
  const active = Math.min(n - 1, Math.floor(o.local / per));
  const inP = o.local / 0.3;
  const outP = (o.dur - o.local) / 0.2;
  const fadeOut = Math.max(0, Math.min(1, outP));
  const white = o.color ?? "#ffffff";
  const accent = style === "bold-yellow" ? "#FFD60A" : style === "neon" ? "#22E4FF" : "#A855F7";

  // Whole-block entrance.
  let alpha = fadeOut;
  let dy = 0;
  let scale = 1;
  if (style === "clean" || style === "minimal") {
    alpha *= ease(inP);
    dy = (1 - ease(inP)) * 10 * o.unit;
  } else if (style === "boxed") {
    alpha *= ease(inP);
    dy = (1 - ease(inP)) * 18 * o.unit;
  } else if (style === "bold-yellow") {
    scale = inP < 1 ? 0.7 + 0.3 * back(inP) : 1;
    alpha *= Math.min(1, inP * 3);
  } else if (style === "cinematic") {
    alpha *= ease(o.local / 0.6);
  } else if (style === "neon") {
    alpha *= ease(inP) * (0.9 + 0.1 * Math.sin(o.local * 6));
  } else if (style === "karaoke" || style === "highlight") {
    alpha *= ease(inP);
  }
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  const cx = o.W / 2;
  const cy = top + blockH / 2 + dy;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const wordX = (w: Word) => o.W / 2 - widths[w.line] / 2 + w.x;
  const wordY = (w: Word) => top + dy + w.line * lineH + lineH / 2;

  // Backgrounds behind the whole block.
  if (style === "boxed" || style === "gradient-bar") {
    const maxW = Math.max(...widths);
    const padX = base * 0.6;
    const padY = base * 0.35;
    const x = o.W / 2 - maxW / 2 - padX;
    const y = top + dy - padY;
    const w = maxW + padX * 2;
    const h = blockH + padY * 2;
    ctx.save();
    if (style === "gradient-bar") {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#d946ef");
      g.addColorStop(0.5, "#7c3aed");
      g.addColorStop(1, "#0ea5e9");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(x, y, w * ease(o.local / 0.35), h);
      ctx.clip();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, base * 0.35);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(10,10,14,0.78)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, base * 0.45);
      ctx.fill();
    }
    ctx.restore();
  }

  for (let i = 0; i < n; i++) {
    const w = words[i];
    const x = wordX(w);
    const y = wordY(w);
    let fill = white;
    let a = 1;
    let s = 1;
    if (style === "pop") {
      const wp = (o.local - i * per) / 0.18;
      if (wp <= 0) continue;
      s = wp < 1 ? 0.5 + 0.5 * back(wp) : 1;
      a = Math.min(1, wp * 2);
    }
    if (style === "karaoke") fill = i <= active ? "#FFD60A" : "rgba(255,255,255,0.92)";
    if (style === "bold-yellow") fill = accent;
    if (style === "minimal") fill = "rgba(255,255,255,0.95)";
    if (style === "gradient-bar" && o.local < 0.2) a = o.local / 0.2;
    if (style === "highlight" && i === active) {
      ctx.save();
      ctx.fillStyle = accent;
      const px = base * 0.18;
      ctx.beginPath();
      ctx.roundRect(x - px, y - base * 0.62, w.w + px * 2, base * 1.24, base * 0.22);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= a;
    if (s !== 1) {
      ctx.translate(x + w.w / 2, y);
      ctx.scale(s, s);
      ctx.translate(-(x + w.w / 2), -y);
    }
    // Legibility: outline + shadow for open styles; glow for neon.
    if (style === "neon") {
      ctx.shadowColor = accent;
      ctx.shadowBlur = base * 0.6;
      ctx.fillStyle = "#E6FDFF";
      ctx.fillText(w.text, x, y);
      ctx.shadowBlur = base * 0.25;
      ctx.fillText(w.text, x, y);
    } else {
      if (style !== "boxed" && style !== "gradient-bar") {
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = base * 0.25;
        ctx.shadowOffsetY = base * 0.06;
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, base * (style === "minimal" || style === "cinematic" ? 0.08 : 0.14));
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(w.text, x, y);
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = fill;
      ctx.fillText(w.text, x, y);
    }
    ctx.restore();
  }
  ctx.restore();
}
