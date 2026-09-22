import type { TimePoint } from "@/src/lib/analytics/types";

/** Dependency-free SVG chart math. Pure functions, tested, accessible tables alongside. */

export interface ChartGeom {
  width: number;
  height: number;
  padding: number;
}

/** Bucket time points per calendar day (sums values). */
export function bucketByDay(points: TimePoint[]): TimePoint[] {
  const map = new Map<string, number>();
  for (const p of points) {
    const day = p.at.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + p.value);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([at, value]) => ({ at, value }));
}

export function chartBounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const max = Math.max(...values);
  return { min: 0, max: max > 0 ? max : 1 };
}

/** Line/area path for values across a fixed box. Empty-safe. */
export function linePath(values: number[], geom: ChartGeom): string {
  if (values.length === 0) return "";
  const { min, max } = chartBounds(values);
  const innerW = geom.width - geom.padding * 2;
  const innerH = geom.height - geom.padding * 2;
  const x = (i: number) => geom.padding + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
  const y = (v: number) => geom.padding + innerH - ((v - min) / (max - min)) * innerH;
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

export function areaPath(values: number[], geom: ChartGeom): string {
  const line = linePath(values, geom);
  if (!line) return "";
  const base = geom.height - geom.padding;
  const firstX = line.split(/[ML]/).filter(Boolean)[0].split(",")[0];
  const lastX = line.split(/[ML]/).filter(Boolean).pop()?.split(",")[0] ?? firstX;
  return `${line} L${lastX},${base} L${firstX},${base} Z`;
}

export interface Bar {
  label: string;
  value: number;
  fraction: number;
}

/** Horizontal bar layout normalized to the max. */
export function barLayout(items: { label: string; value: number }[]): Bar[] {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => ({ label: i.label, value: i.value, fraction: i.value / max }));
}

export function yTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const step = Math.pow(10, Math.floor(Math.log10(max / count)));
  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.05; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(Math.ceil(max));
  return ticks;
}
