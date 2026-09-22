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
}

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
