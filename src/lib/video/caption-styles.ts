/**
 * Caption styles: ten professional looks with their own animation. The same
 * drawing code runs in the live preview and the export, so what you see is
 * what you get. Each video uses one style (chosen in the studio, or picked
 * from the project so different videos don't all look alike).
 */
export type CaptionStyleId =
  | "karaoke"
  | "highlight"
  | "pop"
  | "boxed"
  | "bold-yellow"
  | "neon"
  | "minimal"
  | "gradient-bar"
  | "cinematic"
  | "subtitle-bar"
  | "typewriter"
  | "bounce"
  | "slide-words"
  | "underline"
  | "stacked"
  | "comic"
  | "fire"
  | "glass"
  | "duo-tone";

export interface CaptionStyleInfo {
  id: CaptionStyleId;
  label: string;
  blurb: string;
}

export const CAPTION_STYLES: CaptionStyleInfo[] = [
  { id: "karaoke", label: "Karaoke", blurb: "Each word lights up as it's spoken." },
  { id: "highlight", label: "Highlight", blurb: "The spoken word sits on a colour box." },
  { id: "pop", label: "Word pop", blurb: "Words pop in one by one." },
  { id: "boxed", label: "Boxed", blurb: "White text on a rounded dark card; slides up." },
  { id: "bold-yellow", label: "Bold yellow", blurb: "Heavy yellow capitals with a punchy bounce." },
  { id: "neon", label: "Neon", blurb: "Glowing cyan with a gentle pulse." },
  { id: "minimal", label: "Minimal", blurb: "Smaller, lighter text; calm fade." },
  { id: "gradient-bar", label: "Gradient bar", blurb: "Text on a brand gradient bar that wipes in." },
  { id: "cinematic", label: "Cinematic", blurb: "Spaced capitals with a slow fade." },
  { id: "subtitle-bar", label: "Subtitle bar", blurb: "Film-style text on a soft full-width band." },
  { id: "typewriter", label: "Typewriter", blurb: "Letters type in with a blinking cursor." },
  { id: "bounce", label: "Bounce", blurb: "The spoken word grows and bounces." },
  { id: "slide-words", label: "Slide up", blurb: "Words rise into place one after another." },
  { id: "underline", label: "Underline", blurb: "A bright bar sweeps under each spoken word." },
  { id: "stacked", label: "Big lines", blurb: "One big line at a time, centre screen." },
  { id: "comic", label: "Comic", blurb: "Thick outline, hard shadow and a slight tilt." },
  { id: "fire", label: "Fire", blurb: "Warm orange-to-red lettering that punches in." },
  { id: "glass", label: "Glass", blurb: "Frosted glass card with crisp white text." },
  { id: "duo-tone", label: "Duo tone", blurb: "Alternating white and violet lines; fades up." },
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
  o: { local: number; dur: number; W: number; H: number; unit: number },
): void {
  const vertical = o.H > o.W;
  const upper = style === "bold-yellow" || style === "cinematic" || style === "stacked" || style === "comic" || style === "fire";
  const raw = (upper ? text.toUpperCase() : text).split(/\s+/).filter(Boolean);
  if (!raw.length) return;
  const size =
    style === "minimal" ? 17 :
    style === "subtitle-bar" || style === "typewriter" ? 19 :
    style === "cinematic" ? 17 :
    style === "stacked" ? 30 :
    style === "bold-yellow" || style === "pop" || style === "comic" || style === "fire" ? 24 : 22;
  const base = size * o.unit;
  const weight = style === "minimal" || style === "cinematic" || style === "subtitle-bar" || style === "typewriter" ? 600 : 800;
  const family = style === "typewriter" ? "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" : "Inter, system-ui, sans-serif";
  ctx.save();
  ctx.font = `${weight} ${base}px ${family}`;
  ctx.textBaseline = "middle";
  if (style === "cinematic" && "letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(base * 0.18)}px`;
  const space = ctx.measureText(" ").width * (style === "cinematic" ? 1.6 : 1);
  const maxW = o.W * (style === "stacked" ? 0.9 : vertical ? 0.84 : 0.72);
  const laid = layout(ctx, raw, maxW, space);
  const n = laid.words.length;
  const per = Math.max(0.12, o.dur / n);
  const active = Math.min(n - 1, Math.max(0, Math.floor(o.local / per)));
  const lineH = base * 1.3;

  // "Big lines" shows only the line being spoken, centred lower-middle.
  let words = laid.words;
  let lines = laid.lines;
  let widths = laid.widths;
  if (style === "stacked") {
    const line = laid.words[active].line;
    words = laid.words.filter((w) => w.line === line).map((w) => ({ ...w, line: 0 }));
    lines = 1;
    widths = [laid.widths[line]];
  }
  const blockH = lines * lineH;
  const bottom = style === "stacked" ? o.H * (vertical ? 0.66 : 0.72) : o.H - (vertical ? o.H * 0.2 : o.H * 0.1);
  const top = bottom - blockH;
  const inP = o.local / 0.3;
  const fadeOut = Math.max(0, Math.min(1, (o.dur - o.local) / 0.2));
  const white = "#ffffff";
  const accent = style === "bold-yellow" ? "#FFD60A" : style === "neon" ? "#22E4FF" : style === "underline" ? "#22E4FF" : "#A855F7";

  // Whole-block entrance.
  let alpha = fadeOut;
  let dy = 0;
  let scale = 1;
  let rot = 0;
  if (style === "minimal" || style === "duo-tone" || style === "subtitle-bar" || style === "glass") {
    alpha *= ease(inP);
    dy = (1 - ease(inP)) * 10 * o.unit;
  } else if (style === "boxed") {
    alpha *= ease(inP);
    dy = (1 - ease(inP)) * 18 * o.unit;
  } else if (style === "bold-yellow" || style === "fire") {
    scale = inP < 1 ? 0.7 + 0.3 * back(inP) : 1;
    alpha *= Math.min(1, inP * 3);
  } else if (style === "comic") {
    scale = inP < 1 ? 0.6 + 0.4 * back(inP) : 1;
    alpha *= Math.min(1, inP * 3);
    rot = -0.035;
  } else if (style === "cinematic") {
    alpha *= ease(o.local / 0.6);
  } else if (style === "neon") {
    alpha *= ease(inP) * (0.9 + 0.1 * Math.sin(o.local * 6));
  } else if (style === "karaoke" || style === "highlight" || style === "bounce" || style === "underline") {
    alpha *= ease(inP);
  } else if (style === "stacked") {
    const lineStart = words.length ? laid.words.findIndex((w) => w.line === laid.words[active].line) * per : 0;
    const lp = (o.local - lineStart) / 0.22;
    scale = lp < 1 ? 0.85 + 0.15 * back(lp) : 1;
    alpha *= Math.min(1, lp * 2.5);
  }
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  const cx = o.W / 2;
  const cy = top + blockH / 2 + dy;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const wordX = (w: Word) => o.W / 2 - widths[w.line] / 2 + w.x;
  const wordY = (w: Word) => top + dy + w.line * lineH + lineH / 2;
  const widest = Math.max(...widths);

  // Backgrounds behind the whole block.
  if (style === "boxed" || style === "gradient-bar" || style === "glass" || style === "subtitle-bar") {
    const padX = base * 0.6;
    const padY = base * 0.35;
    const x = style === "subtitle-bar" ? 0 : o.W / 2 - widest / 2 - padX;
    const w = style === "subtitle-bar" ? o.W : widest + padX * 2;
    const y = top + dy - padY;
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
    } else if (style === "glass") {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = Math.max(1, base * 0.05);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = base * 0.8;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, base * 0.6);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.stroke();
    } else if (style === "subtitle-bar") {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.25, "rgba(0,0,0,0.6)");
      g.addColorStop(0.75, "rgba(0,0,0,0.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y - padY, w, h + padY * 2);
    } else {
      ctx.fillStyle = "rgba(10,10,14,0.78)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, base * 0.45);
      ctx.fill();
    }
    ctx.restore();
  }

  // Typewriter: characters appear over the first 70% of the caption.
  const totalChars = raw.join(" ").length;
  const typed = style === "typewriter" ? Math.ceil(totalChars * Math.min(1, o.local / Math.max(0.4, o.dur * 0.7))) : Infinity;
  let charsSoFar = 0;
  let cursor: { x: number; y: number } | null = null;

  const activeIdx = style === "stacked" ? words.findIndex((w) => w.text === laid.words[active].text) : active;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const globalI = style === "stacked" ? laid.words.indexOf(laid.words.filter((lw) => lw.line === laid.words[active].line)[i]) : i;
    const x = wordX(w);
    const y = wordY(w);
    let shown = w.text;
    if (style === "typewriter") {
      const left = typed - charsSoFar;
      charsSoFar += w.text.length + 1;
      if (left <= 0) break;
      shown = w.text.slice(0, left);
    }
    let fill = white;
    let a = 1;
    let sc = 1;
    let ddy = 0;
    if (style === "pop") {
      const wp = (o.local - globalI * per) / 0.18;
      if (wp <= 0) continue;
      sc = wp < 1 ? 0.5 + 0.5 * back(wp) : 1;
      a = Math.min(1, wp * 2);
    }
    if (style === "slide-words") {
      const wp = (o.local - globalI * per * 0.6) / 0.25;
      if (wp <= 0) continue;
      ddy = (1 - ease(wp)) * base * 0.8;
      a = Math.min(1, wp * 1.5);
    }
    if (style === "bounce" && globalI === active) {
      const bp = (o.local - active * per) / Math.min(per, 0.3);
      sc = 1 + 0.22 * Math.sin(Math.min(1, bp) * Math.PI);
      fill = "#FFE066";
    }
    if (style === "karaoke") fill = globalI <= active ? "#FFD60A" : "rgba(255,255,255,0.92)";
    if (style === "bold-yellow") fill = accent;
    if (style === "minimal") fill = "rgba(255,255,255,0.95)";
    if (style === "duo-tone") fill = w.line % 2 === 0 ? white : "#C4B5FD";
    if (style === "gradient-bar" && o.local < 0.2) a = o.local / 0.2;
    if (style === "stacked" && i === activeIdx) fill = "#FFD60A";
    if (style === "highlight" && globalI === active) {
      ctx.save();
      ctx.fillStyle = accent;
      const px = base * 0.18;
      ctx.beginPath();
      ctx.roundRect(x - px, y - base * 0.62, w.w + px * 2, base * 1.24, base * 0.22);
      ctx.fill();
      ctx.restore();
    }
    if (style === "underline" && globalI === active) {
      const up = Math.min(1, (o.local - active * per) / Math.min(per, 0.25));
      ctx.save();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x, y + base * 0.55, w.w * ease(up), base * 0.14, base * 0.07);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= a;
    if (sc !== 1 || ddy) {
      ctx.translate(x + w.w / 2, y + ddy);
      ctx.scale(sc, sc);
      ctx.translate(-(x + w.w / 2), -y);
    }
    if (style === "neon") {
      ctx.shadowColor = accent;
      ctx.shadowBlur = base * 0.6;
      ctx.fillStyle = "#E6FDFF";
      ctx.fillText(shown, x, y);
      ctx.shadowBlur = base * 0.25;
      ctx.fillText(shown, x, y);
    } else if (style === "comic") {
      ctx.fillStyle = "#000";
      ctx.fillText(shown, x + base * 0.1, y + base * 0.1);
      ctx.lineJoin = "round";
      ctx.lineWidth = base * 0.22;
      ctx.strokeStyle = "#000";
      ctx.strokeText(shown, x, y);
      ctx.fillStyle = "#fff";
      ctx.fillText(shown, x, y);
    } else {
      const boxed = style === "boxed" || style === "gradient-bar" || style === "glass" || style === "subtitle-bar";
      if (!boxed) {
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = base * 0.25;
        ctx.shadowOffsetY = base * 0.06;
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, base * (style === "minimal" || style === "cinematic" || style === "typewriter" ? 0.08 : 0.14));
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(shown, x, y);
        ctx.shadowColor = "transparent";
      }
      if (style === "fire") {
        const g = ctx.createLinearGradient(0, y - base * 0.5, 0, y + base * 0.5);
        g.addColorStop(0, "#FFE259");
        g.addColorStop(0.55, "#FF8A00");
        g.addColorStop(1, "#E52E2E");
        ctx.fillStyle = g;
      } else ctx.fillStyle = fill;
      ctx.fillText(shown, x, y);
    }
    ctx.restore();
    if (style === "typewriter") cursor = { x: x + ctx.measureText(shown).width, y };
  }
  // Blinking cursor after the last typed letter.
  if (cursor && Math.floor(o.local * 2.5) % 2 === 0) {
    ctx.fillStyle = white;
    ctx.fillRect(cursor.x + base * 0.08, cursor.y - base * 0.45, base * 0.09, base * 0.9);
  }
  ctx.restore();
}
