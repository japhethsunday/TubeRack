import { z } from "zod";

/**
 * Per-resource API configuration for the REST factory.
 * One source of truth for schemas, searchable/sortable fields, and roles.
 */

const name120 = z.string().trim().min(1).max(120);
const text300 = z.string().trim().max(300).default("");

export const channelConfig = {
  table: "channels" as const,
  createSchema: z.object({ name: name120, niche: text300 }) as never,
  patchSchema: z.object({ name: name120.optional(), niche: z.string().trim().max(300).optional() }) as never,
  columns: ["id", "workspace_id", "name", "niche", "created_at", "updated_at"],
  searchColumns: ["name", "niche"],
  sortColumns: ["created_at", "updated_at", "name"],
  defaultSort: "updated_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "admin" as const,
  auditPrefix: "channel",
};

export const projectConfig = {
  table: "projects" as const,
  createSchema: z.object({
    name: name120,
    channel_id: z.string().min(1).optional(),
    content_type: z.string().max(60).default("Long-form video"),
    platform: z.string().max(60).default("YouTube"),
    topic: z.string().trim().max(2000).default(""),
    description: z.string().max(8000).default(""),
    goal: z.string().trim().max(1000).default(""),
  }) as never,
  patchSchema: z.object({
    name: name120.optional(),
    channel_id: z.string().min(1).nullable().optional(),
    content_type: z.string().max(60).optional(),
    platform: z.string().max(60).optional(),
    topic: z.string().trim().max(2000).optional(),
    description: z.string().max(8000).optional(),
    goal: z.string().trim().max(1000).optional(),
    current_stage: z.string().max(40).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    last_opened_at: z.string().optional(),
  }) as never,
  columns: ["id", "workspace_id", "channel_id", "name", "content_type", "platform", "topic", "description", "goal", "stages", "current_stage", "status", "created_at", "updated_at", "archived_at", "last_opened_at"],
  searchColumns: ["name", "topic", "description", "goal"],
  sortColumns: ["created_at", "updated_at", "name"],
  defaultSort: "updated_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "admin" as const,
  auditPrefix: "project",
};

export const opportunityConfig = {
  table: "opportunities" as const,
  createSchema: z.object({
    title: name120,
    topic: z.string().trim().max(2000).default(""),
    angle: z.string().trim().max(200).default(""),
    audience: z.string().trim().max(500).default(""),
    reasoning: z.string().max(4000).default(""),
    format: z.string().max(120).default(""),
    hook: z.string().trim().max(1000).default(""),
    source_task: z.string().max(120).default(""),
    project_id: z.string().min(1).optional(),
    status: z.enum(["candidate", "chosen", "dismissed"]).default("candidate"),
  }) as never,
  patchSchema: z.object({
    title: name120.optional(),
    status: z.enum(["candidate", "chosen", "dismissed"]).optional(),
    project_id: z.string().min(1).nullable().optional(),
  }) as never,
  columns: ["id", "workspace_id", "project_id", "title", "topic", "angle", "audience", "reasoning", "format", "hook", "source_task", "status", "created_at", "updated_at"],
  searchColumns: ["title", "topic", "angle", "reasoning"],
  sortColumns: ["created_at", "updated_at"],
  defaultSort: "updated_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "opportunity",
};

export const renderRequestConfig = {
  table: "render_requests" as const,
  createSchema: z.object({
    project_id: z.string().min(1),
    preset: z.string().trim().min(1).max(120),
    settings: z.record(z.string(), z.string()).default({}),
    issues: z.array(z.unknown()).default([]),
    health: z.enum(["ready", "review", "blocked"]).default("review"),
  }) as never,
  patchSchema: z.object({
    status: z.enum(["draft", "saved", "queued", "cancelled"]).optional(),
  }) as never,
  columns: ["id", "project_id", "workspace_id", "preset", "settings", "issues", "health", "status", "created_at", "updated_at"],
  searchColumns: ["preset"],
  sortColumns: ["created_at"],
  defaultSort: "created_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "render",
};

export const perfEntryConfig = {
  table: "perf_entries" as const,
  createSchema: z.object({
    project_id: z.string().min(1),
    platform: z.enum(["youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"]).default("youtube"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    views: z.number().int().min(0),
    watch_hours: z.number().min(0).optional(),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
    subs_gained: z.number().int().optional(),
    impressions: z.number().int().min(0).optional(),
    ctr: z.number().min(0).max(100).optional(),
    avg_view_duration_sec: z.number().min(0).optional(),
    retention_pct: z.number().min(0).max(100).optional(),
    traffic_source: z.string().max(200).optional(),
    audience_note: z.string().max(2000).optional(),
    notes: z.string().max(4000).optional(),
  }) as never,
  patchSchema: z.object({
    views: z.number().int().min(0).optional(),
    watch_hours: z.number().min(0).optional(),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
    subs_gained: z.number().int().optional(),
    impressions: z.number().int().min(0).optional(),
    ctr: z.number().min(0).max(100).optional(),
    avg_view_duration_sec: z.number().min(0).optional(),
    retention_pct: z.number().min(0).max(100).optional(),
    traffic_source: z.string().max(200).optional(),
    audience_note: z.string().max(2000).optional(),
    notes: z.string().max(4000).optional(),
  }) as never,
  columns: ["id", "workspace_id", "project_id", "platform", "date", "views", "watch_hours", "likes", "comments", "shares", "subs_gained", "impressions", "ctr", "avg_view_duration_sec", "retention_pct", "traffic_source", "audience_note", "notes", "provenance", "created_at", "updated_at"],
  searchColumns: ["notes", "traffic_source"],
  sortColumns: ["date", "created_at", "views"],
  defaultSort: "date",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "analytics",
};

export const retentionNoteConfig = {
  table: "retention_notes" as const,
  createSchema: z.object({
    project_id: z.string().min(1),
    label: z.string().trim().min(1).max(200),
    note: z.string().trim().min(1).max(4000),
    at_sec: z.number().min(0).optional(),
    section_id: z.string().max(128).optional(),
  }) as never,
  patchSchema: z.object({
    label: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().min(1).max(4000).optional(),
    at_sec: z.number().min(0).optional(),
  }) as never,
  columns: ["id", "project_id", "at_sec", "label", "note", "section_id", "created_at"],
  searchColumns: ["label", "note"],
  sortColumns: ["created_at"],
  defaultSort: "created_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "retention",
};

export const signalConfig = {
  table: "channel_signals" as const,
  createSchema: z.object({
    channel_id: z.string().min(1).optional(),
    kind: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(200),
    evidence: z.string().max(4000).default(""),
    implication: z.string().max(4000).default(""),
    status: z.enum(["active", "archived"]).default("active"),
  }) as never,
  patchSchema: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    evidence: z.string().max(4000).optional(),
    implication: z.string().max(4000).optional(),
    status: z.enum(["active", "archived"]).optional(),
  }) as never,
  columns: ["id", "workspace_id", "channel_id", "kind", "title", "evidence", "implication", "status", "created_at"],
  searchColumns: ["title", "evidence"],
  sortColumns: ["created_at"],
  defaultSort: "created_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "signal",
};

export const snapshotConfig = {
  table: "analytics_snapshots" as const,
  createSchema: z.object({
    name: z.string().trim().min(1).max(200),
    range_days: z.number().int().min(1).max(730).default(28),
    entry_count: z.number().int().min(0).default(0),
    totals: z.record(z.string(), z.number()).default({}),
  }) as never,
  patchSchema: z.object({ name: z.string().trim().min(1).max(200).optional() }) as never,
  columns: ["id", "workspace_id", "name", "at", "range_days", "entry_count", "totals", "created_at"],
  searchColumns: ["name"],
  sortColumns: ["created_at", "at"],
  defaultSort: "created_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "snapshot",
};

export const notificationConfig = {
  table: "notifications" as const,
  createSchema: z.object({}) as never,
  patchSchema: z.object({ read_at: z.string().nullable().optional() }) as never,
  columns: ["id", "user_id", "workspace_id", "type", "title", "body", "read_at", "metadata", "created_at"],
  searchColumns: ["title", "body"],
  sortColumns: ["created_at"],
  defaultSort: "created_at",
  listRole: "viewer" as const,
  writeRole: "editor" as const,
  deleteRole: "editor" as const,
  auditPrefix: "notification",
};
