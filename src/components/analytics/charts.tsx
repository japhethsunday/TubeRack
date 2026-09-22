"use client";

import { bucketByDay, linePath, areaPath, barLayout, yTicks, type ChartGeom } from "@/src/lib/analytics/charts";
import { formatCompact } from "@/src/lib/analytics/metrics";
import type { MetricProvenance, TimePoint } from "@/src/lib/analytics/types";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const GEOM: ChartGeom = { width: 560, height: 180, padding: 28 };

const PROVENANCE_LABEL: Record<MetricProvenance, string> = {
  platform: "Platform",
  calculated: "Calculated",
  manual: "Self-reported",
  local: "Local projects",
};

/** Metric card: value, delta, and always-visible provenance. Never color-only. */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  provenance,
  collectedAt,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaLabel?: string;
  provenance: MetricProvenance;
  collectedAt?: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted-text">
        {label}
        <Badge tone="neutral">{PROVENANCE_LABEL[provenance]}</Badge>
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-text">{unit}</span>}
      </p>
      {delta && (
        <p className="mt-0.5 text-xs text-muted-text">
          <span className="font-medium text-foreground">{delta}</span> {deltaLabel}
        </p>
      )}
      {collectedAt && <p className="mt-0.5 text-[11px] text-muted-text">Logged {collectedAt}</p>}
      {note && <p className="mt-0.5 text-[11px] text-muted-text">{note}</p>}
    </div>
  );
}

function ChartFrame({ title, provenance, children, empty }: { title: string; provenance: MetricProvenance; children: React.ReactNode; empty?: string }) {
  return (
    <figure className="rounded-xl border border-border bg-surface p-4" aria-label={title}>
      <figcaption className="flex items-center justify-between gap-2 text-sm font-semibold">
        {title}
        <Badge tone="neutral">{PROVENANCE_LABEL[provenance]}</Badge>
      </figcaption>
      {empty ? (
        <p role="status" className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-text">
          {empty}
        </p>
      ) : (
        children
      )}
    </figure>
  );
}

/** Line/area chart with native tooltips + an SR table of the same data. */
export function TrendChart({
  title,
  points,
  unit,
  area,
  provenance,
}: {
  title: string;
  points: TimePoint[];
  unit?: string;
  area?: boolean;
  provenance: MetricProvenance;
}) {
  const bucketed = bucketByDay(points);
  if (bucketed.length === 0) {
    return <ChartFrame title={title} provenance={provenance} empty="No points in this range. Log performance to draw this line.">{null}</ChartFrame>;
  }
  const values = bucketed.map((p) => p.value);
  const d = area ? areaPath(values, GEOM) : linePath(values, GEOM);
  const max = Math.max(1, ...values);
  const ticks = yTicks(max);
  const x = (i: number) => GEOM.padding + (bucketed.length === 1 ? (GEOM.width - GEOM.padding * 2) / 2 : (i / (bucketed.length - 1)) * (GEOM.width - GEOM.padding * 2));
  const y = (v: number) => GEOM.padding + (GEOM.height - GEOM.padding * 2) - (v / max) * (GEOM.height - GEOM.padding * 2);
  return (
    <ChartFrame title={title} provenance={provenance}>
      <svg viewBox={`0 0 ${GEOM.width} ${GEOM.height}`} role="img" aria-label={`${title}: ${bucketed.length} points, latest ${values[values.length - 1]}${unit ? ` ${unit}` : ""}`} className="mt-2 w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={GEOM.padding} x2={GEOM.width - GEOM.padding} y1={GEOM.padding + (GEOM.height - GEOM.padding * 2) - (t / max) * (GEOM.height - GEOM.padding * 2)} y2={GEOM.padding + (GEOM.height - GEOM.padding * 2) - (t / max) * (GEOM.height - GEOM.padding * 2)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={2} y={GEOM.padding + (GEOM.height - GEOM.padding * 2) - (t / max) * (GEOM.height - GEOM.padding * 2) + 3} fontSize={9} className="fill-muted-text">{formatCompact(t)}</text>
          </g>
        ))}
        {area ? (
          <path d={d} fill="currentColor" opacity={0.12} className="text-primary" />
        ) : null}
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary" />
        {bucketed.map((p, i) => (
          <circle key={`${p.at}-${i}`} cx={x(i)} cy={y(p.value)} r={3.5} className="fill-primary">
            <title>{`${p.at}: ${p.value.toLocaleString()}${unit ? ` ${unit}` : ""}`}</title>
          </circle>
        ))}
      </svg>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted-text underline">Data table</summary>
        <table className="mt-1 w-full text-left">
          <caption className="sr-only">{title} values</caption>
          <tbody>
            {bucketed.map((p) => (
              <tr key={p.at} className="border-t border-border">
                <th scope="row" className="py-1 pr-2 font-normal text-muted-text">{p.at}</th>
                <td className="py-1 tabular-nums">{p.value.toLocaleString()}{unit ? ` ${unit}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </ChartFrame>
  );
}

/** Distribution bars with labels + values (never color-only). */
export function BarList({
  title,
  items,
  provenance,
  empty,
}: {
  title: string;
  items: { label: string; value: string; numeric: number }[];
  provenance: MetricProvenance;
  empty?: string;
}) {
  if (items.length === 0) {
    return <ChartFrame title={title} provenance={provenance} empty={empty ?? "Nothing to distribute yet."}>{null}</ChartFrame>;
  }
  const bars = barLayout(items.map((i) => ({ label: i.label, value: i.numeric })));
  return (
    <ChartFrame title={title} provenance={provenance}>
      <ul className="mt-2 space-y-2" aria-label={title}>
        {bars.map((b, i) => (
          <li key={b.label}>
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{b.label}</span>
              <span className="shrink-0 tabular-nums text-muted-text">{items[i].value}</span>
            </p>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${b.label}: ${items[i].value}`}>
              <div className={cx("h-full rounded-full bg-primary")} style={{ width: `${Math.max(2, b.fraction * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
