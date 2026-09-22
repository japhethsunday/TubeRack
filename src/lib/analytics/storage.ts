import { z } from "zod";
import type { ChannelSignal, PerformanceEntry, RetentionNote, AnalyticsSnapshot } from "@/src/lib/analytics/types";

const entrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  platform: z.enum(["youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  views: z.number().int().min(0),
  watchHours: z.number().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  subsGained: z.number().int().optional(),
  impressions: z.number().int().min(0).optional(),
  ctr: z.number().min(0).max(100).optional(),
  avgViewDurationSec: z.number().min(0).optional(),
  retentionPct: z.number().min(0).max(100).optional(),
  trafficSource: z.string().optional(),
  audienceNote: z.string().optional(),
  notes: z.string().optional(),
  provenance: z.literal("manual"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const retentionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  atSec: z.number().optional(),
  label: z.string(),
  note: z.string(),
  sectionId: z.string().optional(),
  createdAt: z.string(),
});

const signalSchema = z.object({
  id: z.string(),
  kind: z.enum(["topic-strength", "topic-weak", "format", "hook", "retention", "packaging", "gap", "pattern"]),
  title: z.string(),
  evidence: z.string(),
  implication: z.string(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
});

const snapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  at: z.string(),
  rangeDays: z.number(),
  entryCount: z.number(),
  totals: z.record(z.string(), z.number()),
  createdAt: z.string(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema),
  retention: z.array(retentionSchema),
  signals: z.array(signalSchema),
  snapshots: z.array(snapshotSchema),
});

export interface AnalyticsBundle {
  version: 1;
  entries: PerformanceEntry[];
  retention: RetentionNote[];
  signals: ChannelSignal[];
  snapshots: AnalyticsSnapshot[];
}

export const ANALYTICS_STORAGE_KEY = "tuberack.analytics.v1";

export function emptyAnalyticsBundle(): AnalyticsBundle {
  return { version: 1, entries: [], retention: [], signals: [], snapshots: [] };
}

export function parseAnalyticsBundle(data: unknown): AnalyticsBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack analytics file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data as AnalyticsBundle;
}

/** CSV export of manual entries (real download, honest headers). */
export function entriesToCsv(entries: PerformanceEntry[], projectName: (id: string) => string): string {
  const header = ["date", "project", "platform", "views", "watch_hours", "likes", "comments", "shares", "subs_gained", "impressions", "ctr_pct", "avg_view_sec", "retention_pct", "traffic_source", "audience_note", "notes", "provenance"];
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, projectName(e.projectId), e.platform, e.views, e.watchHours, e.likes, e.comments, e.shares, e.subsGained, e.impressions, e.ctr, e.avgViewDurationSec, e.retentionPct, e.trafficSource, e.audienceNote, e.notes, e.provenance].map(esc).join(","));
  return [header.join(","), ...rows].join("\n");
}
