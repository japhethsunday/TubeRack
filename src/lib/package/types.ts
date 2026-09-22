/**
 * Packaging domain — Phase 9.
 * Thumbnails, titles, SEO, platform packs, and repurposed derivatives.
 * Deterministic local assembly + real checks. No rankings, volumes,
 * CTR predictions, or fabricated metrics anywhere.
 */

export type ApprovalStage = "draft" | "review" | "approved" | "ready";

export interface ThumbnailConcept {
  id: string;
  name: string;
  visual: string;
  subject: string;
  composition: string;
  textDirection: string;
  emotion: string;
  contrast: string;
  background: string;
  brandNotes: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number; // 0–100 (% of canvas width)
  y: number; // 0–100 (% of canvas height)
  size: number; // px at 1280 width
  color: string;
  weight: number;
  align: "left" | "center" | "right";
}

export interface ThumbnailVariant {
  id: string;
  name: string;
  conceptId?: string;
  baseKind: "svg-draft" | "upload";
  baseAssetId?: string;
  baseSvg?: string;
  overlays: TextOverlay[];
  approval: ApprovalStage;
  createdAt: string;
  updatedAt: string;
}

export interface PackTitle {
  id: string;
  text: string;
  category: string;
  status: ApprovalStage;
  isPrimary: boolean;
  createdAt: string;
}

export interface Chapter {
  timeSec: number;
  title: string;
}

export interface SeoPackage {
  projectId: string;
  topic: string;
  secondaryTopics: string;
  intent: string;
  description: string;
  keywords: string[];
  tags: string[];
  hashtags: string[];
  chapters: Chapter[];
  category: string;
  language: string;
  audience: string;
  approval: ApprovalStage;
  updatedAt: string;
}

export type PlatformId =
  | "youtube"
  | "shorts"
  | "tiktok"
  | "reels"
  | "x"
  | "linkedin"
  | "facebook";

export interface PlatformPack {
  platform: PlatformId;
  fields: Record<string, string>;
  approval: ApprovalStage;
  updatedAt: string;
}

export type RepurposeKind =
  | "short-clip"
  | "tiktok-script"
  | "reel-caption"
  | "x-post"
  | "x-thread"
  | "linkedin-post"
  | "instagram-caption"
  | "community-post"
  | "quote"
  | "carousel"
  | "blog-outline"
  | "newsletter";

export interface RepurposeItem {
  id: string;
  kind: RepurposeKind;
  platform: PlatformId;
  hook: string;
  body: string;
  cta: string;
  sourceRef: string;
  status: ApprovalStage;
  createdAt: string;
  updatedAt: string;
}

export type PackageHealth = "ready" | "review" | "missing";
