import type {
  CreatorInsight,
  FormatPerformance,
  PerformanceEntry,
  TopicPerformance,
} from "@/src/lib/analytics/types";
import { average, groupBy, sampleGate, sum } from "@/src/lib/analytics/metrics";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetInsightIds(): void {
  seq = 0;
}

/**
 * Local interpretation detectors. Every insight carries Observation /
 * Evidence / Implication and a sample gate — interpretations without
 * sufficient data are withheld, raw numbers are not.
 */

export interface DetectedInsight extends CreatorInsight {
  gated: boolean;
}

function makeInsight(observation: string, evidence: string, implication: string, sourceIds: string[], gated: boolean): DetectedInsight {
  return {
    id: nextId("ins"),
    observation,
    evidence,
    implication,
    sourceIds,
    saved: false,
    gated,
    createdAt: new Date().toISOString(),
  };
}

export function analyzeFormats(
  entries: PerformanceEntry[],
  formatOf: (projectId: string) => string,
): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  const groups = groupBy(entries, (e) => formatOf(e.projectId));
  if (groups.size < 2) {
    return [
      makeInsight(
        "Not enough variety to compare formats.",
        `Formats present: ${[...groups.keys()].join(", ") || "none"}.`,
        "Log performance across at least two formats to enable comparison.",
        [],
        true,
      ),
    ];
  }
  const avgs = [...groups.entries()].map(([format, list]) => ({
    format,
    n: list.length,
    avgViews: average(list.map((e) => e.views)) ?? 0,
  }));
  avgs.sort((a, b) => b.avgViews - a.avgViews);
  const [top, ...rest] = avgs;
  const gate = sampleGate(top.n, `${top.format} entries`);
  out.push(
    makeInsight(
      `“${top.format}” averages ${Math.round(top.avgViews).toLocaleString()} views per logged entry — highest of ${avgs.length} formats.`,
      `Based on ${top.n} ${top.format} entr${top.n === 1 ? "y" : "ies"} vs ${rest.map((r) => `${r.n} ${r.format}`).join(", ")}.`,
      gate.ok
        ? "This may indicate stronger viewer intent for practical, follow-along content — worth one deliberate follow-up before concluding."
        : `Treat as numbers only: ${gate.message}`,
      entries.filter((e) => formatOf(e.projectId) === top.format).map((e) => e.id),
      !gate.ok,
    ),
  );
  return out;
}

export function analyzeTopics(
  entries: PerformanceEntry[],
  topicOf: (projectId: string) => string,
): DetectedInsight[] {
  const groups = groupBy(entries, (e) => topicOf(e.projectId));
  if (groups.size === 0) return [];
  const ranked: TopicPerformance[] = [...groups.entries()].map(([topic, list]) => ({
    topic: topic || "(untitled)",
    entries: list.length,
    views: sum(list, (e) => e.views),
    avgViews: average(list.map((e) => e.views)) ?? 0,
    projects: [...new Set(list.map((e) => e.projectId))],
  }));
  ranked.sort((a, b) => b.views - a.views);
  const top = ranked[0];
  const gate = sampleGate(top.entries, `entries on “${top.topic}”`);
  return [
    makeInsight(
      `“${top.topic}” leads with ${top.views.toLocaleString()} total logged views across ${top.projects.length} project(s).`,
      `Based on ${top.entries} entr${top.entries === 1 ? "y" : "ies"}. Next: ${ranked[1] ? `“${ranked[1].topic}” at ${ranked[1].views.toLocaleString()}` : "nothing else logged"}.`,
      gate.ok
        ? "Consider a follow-up or variation while the signal is fresh — then re-measure."
        : `Numbers only for now: ${gate.message}`,
      entries.filter((e) => topicOf(e.projectId) === top.topic).map((e) => e.id),
      !gate.ok,
    ),
  ];
}

export function formatTable(entries: PerformanceEntry[], formatOf: (projectId: string) => string): FormatPerformance[] {
  const groups = groupBy(entries, (e) => formatOf(e.projectId));
  return [...groups.entries()]
    .map(([format, list]) => ({
      format,
      entries: list.length,
      views: sum(list, (e) => e.views),
      avgViews: average(list.map((e) => e.views)) ?? 0,
      avgWatchHours: average(list.map((e) => e.watchHours ?? 0).filter((v) => v > 0)) ?? 0,
    }))
    .sort((a, b) => b.views - a.views);
}

export interface PackagingRow {
  projectId: string;
  projectName: string;
  title?: string;
  views: number;
  impressions: number;
  ctr: number | null;
  entries: number;
}

/** Packaging vs performance using only logged impressions/CTR. No causal claims. */
export function analyzePackaging(rows: PackagingRow[]): DetectedInsight[] {
  const withCtr = rows.filter((r) => r.ctr !== null && r.impressions > 0);
  if (withCtr.length === 0) {
    return [
      makeInsight(
        "No impressions/CTR logged yet.",
        "Packaging analysis needs impressions + CTR on at least one record.",
        "Log impressions and CTR from the platform dashboard to unlock this comparison.",
        [],
        true,
      ),
    ];
  }
  const sorted = [...withCtr].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
  const top = sorted[0];
  const gate = sampleGate(withCtr.length, "records with CTR");
  return [
    makeInsight(
      `“${top.projectName}” shows the highest logged CTR at ${(top.ctr ?? 0).toFixed(1)}% over ${top.impressions.toLocaleString()} impressions.`,
      `Associated title: “${top.title ?? "—"}”. Based on ${withCtr.length} record(s) with CTR.`,
      gate.ok
        ? "Associated with — not caused by — its packaging. Compare its title/thumbnail pairing against the lowest-CTR record before concluding anything."
        : `Observed data only: ${gate.message}`,
      [],
      !gate.ok,
    ),
  ];
}
