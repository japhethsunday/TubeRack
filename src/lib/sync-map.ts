import { z } from "zod";

/**
 * Sync mappers: frontend bundles (camelCase) <-> server rows (snake_case).
 * Pure and shared by client sync code and server fan-out. Tombstones carry
 * explicit deletes; everything else merges by id (last-writer-wins per
 * project, server never deletes on plain PUT).
 */

const idList = z.array(z.string().max(128)).max(500).default([]);

export const workspaceSyncSchema = z.object({
  projects: z.array(z.unknown()).max(500).default([]),
  channels: z.array(z.unknown()).max(100).default([]),
  events: z.array(z.unknown()).max(1000).default([]),
  deletedProjectIds: idList,
  deletedChannelIds: idList,
});

export const scriptsSyncSchema = z.object({
  scripts: z.record(z.string(), z.unknown()).default({}),
  boards: z.record(z.string(), z.unknown()).default({}),
  loops: z.record(z.string(), z.array(z.unknown()).max(200)).default({}),
  deletedScripts: idList,
});

export const mediaSyncSchema = z.object({
  assets: z.array(z.unknown()).max(500).default([]),
  voices: z.array(z.unknown()).max(100).default([]),
  consistency: z.array(z.unknown()).max(100).default([]),
  deletedAssetIds: idList,
});

export const videoSyncSchema = z.object({
  compositions: z.array(z.unknown()).max(200).default([]),
  snapshots: z.array(z.unknown()).max(100).default([]),
  requests: z.array(z.unknown()).max(50).default([]),
  deletedRequestIds: idList,
  deletedCompositions: idList,
});

export const intelSyncSchema = z.object({
  dna: z.record(z.string(), z.unknown()).default({}),
  intel: z.record(z.string(), z.unknown()).default({}),
  opportunities: z.array(z.unknown()).max(200).default([]),
  deletedOpportunityIds: idList,
  deletedIntel: idList,
});

export const packagingSyncSchema = z.object({
  concepts: z.array(z.unknown()).max(200).default([]),
  variants: z.array(z.unknown()).max(200).default([]),
  titles: z.array(z.unknown()).max(200).default([]),
  seo: z.array(z.unknown()).max(200).default([]),
  packs: z.array(z.unknown()).max(200).default([]),
  items: z.array(z.unknown()).max(500).default([]),
  deletedVariantIds: idList,
  deletedTitleIds: idList,
  deletedItemIds: idList,
  deletedProjects: idList,
});

export const analyticsSyncSchema = z.object({
  entries: z.array(z.unknown()).max(1000).default([]),
  retention: z.array(z.unknown()).max(500).default([]),
  signals: z.array(z.unknown()).max(200).default([]),
  snapshots: z.array(z.unknown()).max(50).default([]),
  deletedEntryIds: idList,
  deletedRetentionIds: idList,
  deletedSignalIds: idList,
  deletedSnapshotIds: idList,
});

export const SYNC_SCHEMAS = {
  workspace: workspaceSyncSchema,
  scripts: scriptsSyncSchema,
  media: mediaSyncSchema,
  video: videoSyncSchema,
  intel: intelSyncSchema,
  packaging: packagingSyncSchema,
  analytics: analyticsSyncSchema,
} as const;

export type SyncKind = keyof typeof SYNC_SCHEMAS;

/* ---------------- row builders (server fan-out uses these) ---------------- */

export interface ProjectDoc {
  id: string;
  channelId?: string;
  name: string;
  contentType?: string;
  platform?: string;
  topic?: string;
  description?: string;
  goal?: string;
  stages?: Record<string, string>;
  currentStage?: string;
  status?: string;
}

export function toProjectRow(p: ProjectDoc, workspaceId: string): Record<string, unknown> {
  return {
    id: p.id,
    workspace_id: workspaceId,
    channel_id: p.channelId ?? null,
    name: String(p.name ?? "Untitled").slice(0, 120),
    content_type: String(p.contentType ?? "Long-form video").slice(0, 60),
    platform: String(p.platform ?? "YouTube").slice(0, 60),
    topic: String(p.topic ?? "").slice(0, 2000),
    description: String(p.description ?? "").slice(0, 8000),
    goal: String(p.goal ?? "").slice(0, 1000),
    stages: p.stages && typeof p.stages === "object" ? p.stages : {},
    current_stage: String(p.currentStage ?? "idea").slice(0, 40),
    status: ["draft", "active", "archived"].includes(String(p.status)) ? p.status : "draft",
  };
}

export interface ChannelDoc {
  id: string;
  name: string;
  niche?: string;
}

export function toChannelRow(c: ChannelDoc, workspaceId: string): Record<string, unknown> {
  return {
    id: c.id,
    workspace_id: workspaceId,
    name: String(c.name ?? "Channel").slice(0, 120),
    niche: String(c.niche ?? "").slice(0, 300),
  };
}

export interface EventDoc {
  id: string;
  projectId?: string;
  projectName?: string;
  kind?: string;
  category?: string;
  detail?: string;
  at?: string;
}

export function toEventRow(e: EventDoc, workspaceId: string): Record<string, unknown> {
  return {
    id: e.id,
    project_id: e.projectId ?? null,
    workspace_id: workspaceId,
    actor_id: null,
    kind: String(e.kind ?? "event").slice(0, 120),
    detail: { projectName: e.projectName ?? "", category: e.category ?? "", detail: e.detail ?? "" },
  };
}

export interface ScriptDoc {
  format?: string;
  tone?: string;
  complexity?: string;
  structure?: string;
  targetWords?: number;
  wpm?: number;
  instruction?: string;
  sections?: unknown[];
  versions?: unknown[];
  notes?: string;
}

export function toScriptRow(projectId: string, s: ScriptDoc): Record<string, unknown> {
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
  return {
    project_id: projectId,
    format: String(s.format ?? "YouTube long-form").slice(0, 120),
    tone: String(s.tone ?? "Conversational").slice(0, 120),
    complexity: String(s.complexity ?? "Beginner").slice(0, 60),
    structure: String(s.structure ?? "Standard").slice(0, 60),
    target_words: num(s.targetWords, 900, 0, 100000),
    wpm: num(s.wpm, 150, 60, 300),
    instruction: String(s.instruction ?? "").slice(0, 8000),
    sections: Array.isArray(s.sections) ? s.sections.slice(0, 500) : [],
    versions: Array.isArray(s.versions) ? s.versions.slice(0, 50) : [],
    notes: String(s.notes ?? "").slice(0, 20000),
  };
}

export interface BoardDoc {
  scenes?: unknown[];
}

export function toBoardRow(projectId: string, b: BoardDoc): Record<string, unknown> {
  return { project_id: projectId, scenes: Array.isArray(b.scenes) ? b.scenes.slice(0, 500) : [] };
}

export interface MediaDoc {
  id: string;
  projectId?: string;
  sceneIds?: string[];
  kind?: string;
  source?: string;
  status?: string;
  title?: string;
  payload?: string;
  mime?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  seed?: number;
  tags?: string[];
  approval?: string;
  error?: string;
}

const MEDIA_KINDS = ["image", "video", "voice", "music", "sfx"];
const MEDIA_SOURCES = ["local-draft", "upload-session", "provider-request", "provider-output"];
const MEDIA_STATUSES = ["pending", "preparing", "generating", "processing", "ready", "failed", "cancelled"];
const MEDIA_APPROVALS = ["draft", "reviewed", "approved", "used", "rejected"];

export function toAssetRow(a: MediaDoc, workspaceId: string): Record<string, unknown> | null {
  if (!a.id || !MEDIA_KINDS.includes(String(a.kind))) return null;
  const pick = (v: unknown, list: string[], fallback: string) =>
    typeof v === "string" && list.includes(v) ? v : fallback;
  return {
    id: a.id,
    workspace_id: workspaceId,
    project_id: a.projectId ?? null,
    scene_ids: Array.isArray(a.sceneIds) ? a.sceneIds.filter((s) => typeof s === "string").slice(0, 200) : [],
    kind: a.kind,
    source: pick(a.source, MEDIA_SOURCES, "local-draft"),
    status: pick(a.status, MEDIA_STATUSES, "pending"),
    title: String(a.title ?? "Untitled").slice(0, 200),
    payload: typeof a.payload === "string" ? a.payload.slice(0, 2000000) : "",
    mime: String(a.mime ?? "").slice(0, 120),
    duration_sec: typeof a.durationSec === "number" ? a.durationSec : null,
    width: typeof a.width === "number" ? Math.floor(a.width) : null,
    height: typeof a.height === "number" ? Math.floor(a.height) : null,
    file_size: typeof a.fileSize === "number" ? Math.floor(a.fileSize) : null,
    seed: typeof a.seed === "number" ? Math.floor(a.seed) : null,
    tags: Array.isArray(a.tags) ? a.tags.filter((t) => typeof t === "string").slice(0, 20) : [],
    approval: pick(a.approval, MEDIA_APPROVALS, "draft"),
    storage_key: null,
    error: typeof a.error === "string" ? a.error.slice(0, 1000) : null,
  };
}

export interface CompositionDoc {
  tracks?: unknown[];
  clips?: unknown[];
  canvas?: Record<string, unknown>;
  snapshots?: unknown[];
}

export function toCompositionRow(projectId: string, c: CompositionDoc): Record<string, unknown> {
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    project_id: projectId,
    tracks: arr(c.tracks, 50),
    clips: arr(c.clips, 2000),
    canvas: c.canvas && typeof c.canvas === "object" ? c.canvas : {},
    snapshots: arr(c.snapshots, 20),
  };
}

export interface IntelDoc {
  audience?: unknown;
  strategy?: unknown;
  titles?: unknown[];
  hooks?: unknown[];
  retention?: unknown[];
  brief?: string;
  history?: unknown[];
}

export function toIntelRow(projectId: string, doc: IntelDoc): Record<string, unknown> {
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    project_id: projectId,
    audience: doc.audience ?? null,
    strategy: doc.strategy ?? null,
    titles: arr(doc.titles, 200),
    hooks: arr(doc.hooks, 200),
    retention: arr(doc.retention, 100),
    brief: typeof doc.brief === "string" ? doc.brief.slice(0, 100000) : "",
    history: arr(doc.history, 100),
  };
}

export interface PackagingDoc {
  concepts?: unknown[];
  variants?: unknown[];
  titles?: unknown[];
  seo?: unknown;
  packs?: unknown[];
  items?: unknown[];
}

export function toPackagingRow(projectId: string, doc: PackagingDoc): Record<string, unknown> {
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    project_id: projectId,
    concepts: arr(doc.concepts, 50),
    variants: arr(doc.variants, 100),
    titles: arr(doc.titles, 100),
    seo: doc.seo && typeof doc.seo === "object" ? doc.seo : {},
    packs: arr(doc.packs, 20),
    items: arr(doc.items, 300),
  };
}

/* ---------------- client row readers (server GET assembly) ---------------- */

export function fromProjectRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    contentType: row.content_type,
    platform: row.platform,
    topic: row.topic,
    description: row.description,
    goal: row.goal,
    stages: row.stages,
    currentStage: row.current_stage,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromChannelRow(row: Record<string, unknown>): Record<string, unknown> {
  return { id: row.id, name: row.name, niche: row.niche, createdAt: row.created_at };
}

export function fromEventRow(row: Record<string, unknown>): Record<string, unknown> {
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    at: row.created_at,
    kind: row.kind,
    category: detail.category ?? "projects",
    projectId: row.project_id ?? undefined,
    projectName: detail.projectName ?? "",
    detail: detail.detail ?? "",
  };
}

export function fromAssetRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneIds: row.scene_ids ?? [],
    kind: row.kind,
    source: row.source,
    status: row.status,
    title: row.title,
    payload: row.payload ?? "",
    mime: row.mime ?? "",
    durationSec: row.duration_sec ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    fileSize: row.file_size ?? undefined,
    seed: row.seed ?? undefined,
    tags: row.tags ?? [],
    approval: row.approval,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
