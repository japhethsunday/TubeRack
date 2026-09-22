/**
 * Visual & Audio domain — Phase 7.
 * Assets stay associated Workspace → Channel → Project → Scene.
 * Generation is on-device drafts + validated uploads until Phase 11
 * providers; nothing is ever presented as provider output.
 */

export type MediaKind = "image" | "video" | "voice" | "music" | "sfx";

export type MediaSource = "local-draft" | "upload-session" | "provider-request";

export type MediaStatus =
  | "pending"
  | "preparing"
  | "generating"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled";

export type ApprovalState = "draft" | "reviewed" | "approved" | "used" | "rejected";

export interface MediaAsset {
  id: string;
  projectId: string;
  sceneIds: string[];
  kind: MediaKind;
  source: MediaSource;
  status: MediaStatus;
  title: string;
  /** Local draft payload (SVG markup / synth recipe / TTS settings) or upload metadata. */
  payload: string;
  mime: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  seed?: number;
  tags: string[];
  approval: ApprovalState;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceProfile {
  id: string;
  projectId: string;
  name: string;
  language: string;
  rate: number;
  pitch: number;
  /** Resolved on-device voice name; provider mapping lands in Phase 11. */
  systemVoice: string;
  providerVoice: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ConsistencySettings {
  projectId: string;
  visualStyle: string;
  colorDirection: string;
  lighting: string;
  cameraLanguage: string;
  characterNotes: string;
  environmentStyle: string;
  avoidStyles: string;
  updatedAt: string;
}

export interface GenerationJob {
  id: string;
  projectId: string;
  kind: MediaKind;
  label: string;
  status: MediaStatus;
  progress: number;
  params: Record<string, string>;
  assetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadSession {
  id: string;
  name: string;
  mime: string;
  size: number;
  progress: number;
  status: "reading" | "ready" | "failed" | "cancelled";
  error?: string;
}
