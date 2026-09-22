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

export interface TransitionDef {
  id: string;
  label: string;
  blurb: string;
  defaultSec: number;
}

export const TRANSITIONS: TransitionDef[] = [
  { id: "cut", label: "Cut", blurb: "Instant switch. Always safe.", defaultSec: 0 },
  { id: "fade", label: "Fade", blurb: "Through black. Endings and openings.", defaultSec: 0.5 },
  { id: "dissolve", label: "Dissolve", blurb: "Soft blend between related beats.", defaultSec: 0.5 },
  { id: "slide", label: "Slide", blurb: "Directional energy.", defaultSec: 0.4 },
  { id: "zoom", label: "Zoom", blurb: "Punch into the next scene.", defaultSec: 0.4 },
  { id: "wipe", label: "Wipe", blurb: "Graphic sweep. Use sparingly.", defaultSec: 0.5 },
];

export function transitionById(id: string | undefined): TransitionDef {
  return TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[0];
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

export const MOTIONS = ["none", "kenburns", "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"] as const;
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
