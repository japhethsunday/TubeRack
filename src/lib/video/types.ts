/**
 * Video composition model — Phase 8.
 * Clips reference media assets by ID (never duplicate bytes). Scenes own
 * timeline segments; the storyboard remains the source of scene order.
 * Rendering happens in Phase 11 — this model is the contract workers use.
 */

export type ClipKind = "video" | "image" | "voice" | "music" | "sfx" | "text" | "captions";

export type TrackKind = ClipKind;

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  label: string;
  muted: boolean;
  hidden: boolean;
  /** Track volume (0–2, default 1), applied on top of each clip's volume. */
  volume?: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  sceneId?: string;
  kind: ClipKind;
  name: string;
  assetId?: string;
  text?: string;
  startSec: number;
  durationSec: number;
  volume: number; // 0–1
  fadeInSec: number;
  fadeOutSec: number;
  muted: boolean;
  motion?: string;
  transitionIn?: string;
  transitionOut?: string;
  effectIds?: string[];
  style?: TextStyle;
  /** Where playback starts inside the source media (seconds) — non-destructive trim. */
  inSec?: number;
  /** Playback speed multiplier (0.25–4). Timeline duration is independent. */
  speed?: number;
  /** Reverse playback (audio + images; video reverse is baked on export). */
  reverse?: boolean;
  transform?: ClipTransform;
  /** Crop as fractions of each edge (0–0.45). */
  crop?: { top: number; right: number; bottom: number; left: number };
  filters?: ClipFilters;
  /** Layer opacity 0–1 (multiplied with fades). */
  opacity?: number;
  /** How media fills the frame. */
  fit?: "contain" | "cover" | "fill";
  /** Text entrance animation. */
  textAnim?: "none" | "fade" | "slide-up" | "pop" | "typewriter" | "wipe";
}

export interface ClipTransform {
  /** Offset from centre as a fraction of frame width/height (-1..1). */
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
  flipH: boolean;
  flipV: boolean;
}

export interface ClipFilters {
  brightness: number; // % (100 = unchanged)
  contrast: number;
  saturation: number;
  hue: number; // degrees
  blur: number; // px at 1080p
  grayscale: number; // %
  sepia: number; // %
  vignette: number; // 0–100
}

export const NEUTRAL_FILTERS: ClipFilters = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, vignette: 0 };
export const IDENTITY_TRANSFORM: ClipTransform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };

export interface TextStyle {
  font: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  position: "top" | "center" | "bottom";
  color: string;
  background: string;
  opacity: number;
}

export interface CanvasSettings {
  preset: string;
  aspect: string;
  width: number;
  height: number;
  /** Frame background behind all layers. */
  background?: string;
}

export interface Composition {
  projectId: string;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  canvas: CanvasSettings;
  updatedAt: string;
}

export type IssueSeverity = "block" | "warn";

export interface ValidationIssue {
  severity: IssueSeverity;
  scene?: string;
  message: string;
  fix: string;
}

export type HealthState = "ready" | "review" | "blocked";

export type RenderRequestStatus = "draft" | "saved";

export interface RenderRequest {
  id: string;
  projectId: string;
  preset: string;
  settings: Record<string, string>;
  issues: ValidationIssue[];
  health: HealthState;
  status: RenderRequestStatus;
  createdAt: string;
}

export interface CompositionSnapshot {
  id: string;
  name: string;
  at: string;
  data: Composition;
}
