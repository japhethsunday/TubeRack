/**
 * Analytics data contracts — Phase 10.
 * Every value carries provenance: platform-provided, calculated, manual, or
 * local. Nothing is ever presented without its source and freshness.
 */

export type MetricProvenance = "platform" | "calculated" | "manual" | "local";

export type PlatformId = "youtube" | "shorts" | "tiktok" | "reels" | "x" | "linkedin" | "facebook";

export interface AnalyticsMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  provenance: MetricProvenance;
  source?: string;
  collectedAt?: string;
  note?: string;
}

export interface TimePoint {
  at: string;
  value: number;
}

export interface AnalyticsTimeSeries {
  metric: string;
  label: string;
  unit: string;
  provenance: MetricProvenance;
  points: TimePoint[];
}

export interface AnalyticsSnapshot {
  id: string;
  name: string;
  at: string;
  rangeDays: number;
  entryCount: number;
  totals: Record<string, number>;
  createdAt: string;
}

/** Self-reported platform performance. Provenance is always manual. */
export interface PerformanceEntry {
  id: string;
  projectId: string;
  platform: PlatformId;
  date: string; // YYYY-MM-DD observed
  views: number;
  watchHours?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  subsGained?: number;
  impressions?: number;
  ctr?: number; // percent 0–100
  avgViewDurationSec?: number;
  retentionPct?: number;
  trafficSource?: string;
  audienceNote?: string;
  notes?: string;
  provenance: "manual";
  createdAt: string;
  updatedAt: string;
}

export interface ContentPerformance {
  projectId: string;
  projectName: string;
  platform: PlatformId;
  topic: string;
  format: string;
  publishedAt?: string;
  entries: PerformanceEntry[];
}

export interface VideoAnalytics {
  projectId: string;
  totals: Record<string, number>;
  latest?: PerformanceEntry;
  entryCount: number;
  retentionNotes: RetentionNote[];
}

export interface RetentionNote {
  id: string;
  projectId: string;
  atSec?: number;
  label: string;
  note: string;
  sectionId?: string;
  createdAt: string;
}

export interface AudienceInsight {
  id: string;
  projectId?: string;
  topic: string;
  detail: string;
  createdAt: string;
}

export interface TrafficSource {
  source: string;
  views: number;
  entries: number;
}

export interface PackagingPerformance {
  projectId: string;
  projectName: string;
  title?: string;
  thumbnail?: string;
  views: number;
  impressions: number;
  ctr: number | null;
  entries: number;
}

export interface TopicPerformance {
  topic: string;
  entries: number;
  views: number;
  avgViews: number;
  projects: string[];
}

export interface FormatPerformance {
  format: string;
  entries: number;
  views: number;
  avgViews: number;
  avgWatchHours: number;
}

export type SignalKind =
  | "topic-strength"
  | "topic-weak"
  | "format"
  | "hook"
  | "retention"
  | "packaging"
  | "gap"
  | "pattern";

export interface ChannelSignal {
  id: string;
  kind: SignalKind;
  title: string;
  evidence: string;
  implication: string;
  status: "active" | "archived";
  createdAt: string;
}

export interface CreatorInsight {
  id: string;
  observation: string;
  evidence: string;
  implication: string;
  sourceIds: string[];
  saved: boolean;
  createdAt: string;
}

export interface ContentOpportunityDraft {
  title: string;
  topic: string;
  angle: string;
  audience: string;
  reasoning: string;
  format: string;
  hook: string;
  sourceTask: string;
  projectId?: string;
}

export interface AnalyticsAlert {
  id: string;
  kind: "milestone" | "swing" | "stale" | "gap";
  title: string;
  detail: string;
  rule: string;
  createdAt: string;
}

export interface Benchmark {
  label: string;
  current: number;
  baseline: number;
  deltaPct: number | null;
  basis: string;
}

export interface AnalyticsReport {
  name: string;
  rangeDays: number;
  generatedAt: string;
  metrics: AnalyticsMetric[];
  topContent: { projectId: string; projectName: string; views: number }[];
  insights: { observation: string; evidence: string }[];
}
