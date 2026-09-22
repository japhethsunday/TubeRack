import type { PerformanceEntry } from "@/src/lib/analytics/types";

/** Pure analytics math. Null in, null out — never invent. */

export function sum(entries: PerformanceEntry[], pick: (e: PerformanceEntry) => number | undefined): number {
  return entries.reduce((n, e) => n + (pick(e) ?? 0), 0);
}

/** (likes + comments + shares) / views. Null without views. */
export function engagementRate(entries: PerformanceEntry[]): number | null {
  const views = sum(entries, (e) => e.views);
  if (views <= 0) return null;
  return ((sum(entries, (e) => e.likes) + sum(entries, (e) => e.comments) + sum(entries, (e) => e.shares)) / views) * 100;
}

/** Percent change current vs baseline. Null when baseline is empty. */
export function growthRate(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((n, v) => n + v, 0) / values.length;
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

export interface PeriodSplit {
  current: PerformanceEntry[];
  previous: PerformanceEntry[];
  currentLabel: string;
  previousLabel: string;
}

/** Split entries into current vs previous window by observed date. */
export function splitPeriod(entries: PerformanceEntry[], rangeDays: number, nowMs?: number): PeriodSplit {
  const now = nowMs ?? Date.now();
  const cutoff = now - rangeDays * 86400000;
  const prevCutoff = cutoff - rangeDays * 86400000;
  const at = (e: PerformanceEntry) => new Date(`${e.date}T00:00:00`).getTime();
  return {
    current: entries.filter((e) => at(e) >= cutoff),
    previous: entries.filter((e) => at(e) >= prevCutoff && at(e) < cutoff),
    currentLabel: `last ${rangeDays} days`,
    previousLabel: `previous ${rangeDays} days`,
  };
}

/** Minimum-sample gate for interpretations. Raw numbers always show; conclusions need n. */
export const MIN_SAMPLE = 3;

export function sampleGate(n: number, what: string): { ok: boolean; message: string } {
  if (n >= MIN_SAMPLE) return { ok: true, message: `${n} records — enough for a cautious read.` };
  return { ok: false, message: `Only ${n} record(s) for ${what} — shown as numbers, not trends. Interpretations unlock at ${MIN_SAMPLE}.` };
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return "n/a (no baseline)";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}
