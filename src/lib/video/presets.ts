import type { TextStyle } from "@/src/lib/video/types";

/** Platform presets: aspect + resolution + frame rate. Extensible list. */
export interface PlatformPreset {
  id: string;
  label: string;
  aspect: string;
  width: number;
  height: number;
  fps: number;
  format: string;
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: "youtube", label: "YouTube", aspect: "16:9", width: 1920, height: 1080, fps: 30, format: "mp4" },
  { id: "shorts", label: "YouTube Shorts", aspect: "9:16", width: 1080, height: 1920, fps: 30, format: "mp4" },
  { id: "tiktok", label: "TikTok", aspect: "9:16", width: 1080, height: 1920, fps: 30, format: "mp4" },
  { id: "reels", label: "Instagram Reels", aspect: "9:16", width: 1080, height: 1920, fps: 30, format: "mp4" },
  { id: "square", label: "Square", aspect: "1:1", width: 1080, height: 1080, fps: 30, format: "mp4" },
  { id: "custom", label: "Custom", aspect: "16:9", width: 1920, height: 1080, fps: 30, format: "mp4" },
];

export function presetById(id: string): PlatformPreset {
  return PLATFORM_PRESETS.find((p) => p.id === id) ?? PLATFORM_PRESETS[0];
}

/** A project is a Short when its platform or content type says so; everything else is long-form 16:9. */
export function projectIsShort(project: { platform?: string; contentType?: string }): boolean {
  return /shorts|tiktok|reels/i.test(project.platform ?? "") || /^short/i.test(project.contentType ?? "");
}

/** The canvas preset a project's format calls for. */
export function presetForProject(project: { platform?: string; contentType?: string }): PlatformPreset {
  return presetById(projectIsShort(project) ? "shorts" : "youtube");
}

export interface TransitionDef {
  id: string;
  label: string;
  blurb: string;
  defaultSec: number;
}

export const TRANSITIONS: TransitionDef[] = [
  { id: "cut", label: "Cut", blurb: "Instant switch. Always safe.", defaultSec: 0 },
  { id: "fade", label: "Crossfade", blurb: "The next clip blends over the last.", defaultSec: 0.6 },
  { id: "dip-black", label: "Fade to black", blurb: "Out to black, then in. Scene changes.", defaultSec: 0.8 },
  { id: "dip-white", label: "Flash", blurb: "Quick white flash. High energy.", defaultSec: 0.4 },
  { id: "slide-left", label: "Slide left", blurb: "Next clip slides in from the right.", defaultSec: 0.5 },
  { id: "slide-right", label: "Slide right", blurb: "Next clip slides in from the left.", defaultSec: 0.5 },
  { id: "slide-up", label: "Slide up", blurb: "Next clip rises from the bottom.", defaultSec: 0.5 },
  { id: "slide-down", label: "Slide down", blurb: "Next clip drops from the top.", defaultSec: 0.5 },
  { id: "push-left", label: "Push left", blurb: "Next clip pushes the last one out.", defaultSec: 0.5 },
  { id: "push-right", label: "Push right", blurb: "Pushes the last clip out to the right.", defaultSec: 0.5 },
  { id: "zoom-in", label: "Zoom in", blurb: "Punch into the next scene.", defaultSec: 0.5 },
  { id: "zoom-out", label: "Zoom out", blurb: "Next scene grows from the centre.", defaultSec: 0.5 },
  { id: "wipe-left", label: "Wipe left", blurb: "A clean edge sweeps across.", defaultSec: 0.6 },
  { id: "wipe-right", label: "Wipe right", blurb: "A clean edge sweeps across.", defaultSec: 0.6 },
  { id: "wipe-up", label: "Wipe up", blurb: "Sweeps from the bottom.", defaultSec: 0.6 },
  { id: "wipe-down", label: "Wipe down", blurb: "Sweeps from the top.", defaultSec: 0.6 },
  { id: "circle", label: "Circle reveal", blurb: "Opens from the centre.", defaultSec: 0.7 },
  { id: "blur", label: "Blur", blurb: "Dreamy blurred blend.", defaultSec: 0.7 },
  { id: "spin", label: "Spin", blurb: "Twists in. Use sparingly.", defaultSec: 0.6 },
];

/** Older saved ids map onto the current set. */
export function normalizeTransition(id: string | undefined): string {
  if (!id) return "cut";
  if (id === "dissolve") return "fade";
  if (id === "slide") return "slide-left";
  if (id === "zoom") return "zoom-in";
  if (id === "wipe") return "wipe-right";
  return TRANSITIONS.some((t) => t.id === id) ? id : "cut";
}

export function transitionById(id: string | undefined): TransitionDef {
  const n = normalizeTransition(id);
  return TRANSITIONS.find((t) => t.id === n) ?? TRANSITIONS[0];
}

export interface EffectDef {
  id: string;
  label: string;
  blurb: string;
  params: string[];
}

export const EFFECTS: EffectDef[] = [
  { id: "zoom", label: "Zoom", blurb: "Slow push-in.", params: ["amount"] },
  { id: "pan", label: "Pan", blurb: "Lateral drift.", params: ["direction", "amount"] },
  { id: "blur", label: "Blur", blurb: "Background softening.", params: ["amount"] },
  { id: "brightness", label: "Brightness", blurb: "Exposure lift or crush.", params: ["amount"] },
  { id: "contrast", label: "Contrast", blurb: "Punch control.", params: ["amount"] },
  { id: "saturation", label: "Saturation", blurb: "Color intensity.", params: ["amount"] },
  { id: "opacity", label: "Opacity", blurb: "Layer transparency.", params: ["amount"] },
];

export const MOTIONS = [
  "none",
  "kenburns",
  "kenburns-right",
  "zoom-in",
  "zoom-out",
  "zoom-in-fast",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "diagonal",
  "drift",
  "breathe",
  "tilt",
  "rotate",
  "shake",
  "pop-in",
] as const;

export const MOTION_LABELS: Record<(typeof MOTIONS)[number], string> = {
  none: "Still",
  kenburns: "Ken Burns",
  "kenburns-right": "Ken Burns right",
  "zoom-in": "Slow zoom in",
  "zoom-out": "Slow zoom out",
  "zoom-in-fast": "Punch zoom",
  "pan-left": "Pan left",
  "pan-right": "Pan right",
  "pan-up": "Pan up",
  "pan-down": "Pan down",
  diagonal: "Diagonal glide",
  drift: "Float",
  breathe: "Breathe",
  tilt: "Tilt",
  rotate: "Slow rotate",
  shake: "Handheld",
  "pop-in": "Pop in",
};
export type MotionId = (typeof MOTIONS)[number];

export interface TextPreset {
  id: string;
  label: string;
  style: TextStyle;
}

const BASE_FONT = "system-ui, sans-serif";

export const TEXT_PRESETS: TextPreset[] = [
  { id: "title", label: "Title", style: { font: BASE_FONT, size: 64, weight: 800, align: "center", position: "center", color: "#ffffff", background: "transparent", opacity: 1 } },
  { id: "subtitle", label: "Subtitle", style: { font: BASE_FONT, size: 32, weight: 600, align: "center", position: "bottom", color: "#ffffff", background: "rgba(0,0,0,0.55)", opacity: 1 } },
  { id: "lower-third", label: "Lower third", style: { font: BASE_FONT, size: 28, weight: 600, align: "left", position: "bottom", color: "#ffffff", background: "rgba(0,0,0,0.65)", opacity: 1 } },
  { id: "callout", label: "Callout", style: { font: BASE_FONT, size: 36, weight: 700, align: "center", position: "top", color: "#fef08a", background: "transparent", opacity: 1 } },
  { id: "quote", label: "Quote", style: { font: BASE_FONT, size: 40, weight: 500, align: "center", position: "center", color: "#ffffff", background: "transparent", opacity: 1 } },
  { id: "heading", label: "Section heading", style: { font: BASE_FONT, size: 48, weight: 800, align: "left", position: "top", color: "#ffffff", background: "transparent", opacity: 1 } },
];

export function textPresetById(id: string): TextPreset {
  return TEXT_PRESETS.find((t) => t.id === id) ?? TEXT_PRESETS[1];
}

/** Brand-aware defaults: DNA tone + consistency colors seed title styles. */
export function brandedTitleStyle(brandColor: string, font?: string): TextStyle {
  const base = textPresetById("title").style;
  return { ...base, color: brandColor.trim() || base.color, font: font?.trim() || base.font };
}
