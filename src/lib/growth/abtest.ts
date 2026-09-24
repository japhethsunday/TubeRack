/** Thumbnail A/B math: aggregate rotation windows per variant and pick a winner. */

export interface WindowStat {
  variantId: string;
  days: number;
  metric: "ctr" | "views";
  impressions: number | null;
  ctr: number | null; // percent, as YouTube reports it
  views: number;
  watchMinutes: number;
}

export interface VariantResult {
  variantId: string;
  days: number;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  views: number;
  viewsPerDay: number;
  watchMinutes: number;
}

export interface AbOutcome {
  metric: "ctr" | "views";
  variants: VariantResult[];
  winnerId: string | null;
  liftPct: number | null;
  confidence: number | null; // 0..1, two-proportion z-test (CTR only)
  note: string;
}

function normCdf(z: number): number {
  // Abramowitz–Stegun approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function abOutcome(windows: WindowStat[], variantIds: string[]): AbOutcome {
  const metric: "ctr" | "views" = windows.length > 0 && windows.every((w) => w.metric === "ctr") ? "ctr" : "views";
  const variants: VariantResult[] = variantIds.map((id) => {
    const ws = windows.filter((w) => w.variantId === id);
    const days = ws.reduce((a, w) => a + w.days, 0);
    const views = ws.reduce((a, w) => a + w.views, 0);
    const impressions = metric === "ctr" ? ws.reduce((a, w) => a + (w.impressions ?? 0), 0) : null;
    const clicks = metric === "ctr" ? ws.reduce((a, w) => a + ((w.impressions ?? 0) * (w.ctr ?? 0)) / 100, 0) : null;
    return {
      variantId: id,
      days,
      impressions,
      clicks: clicks === null ? null : Math.round(clicks),
      ctr: impressions ? ((clicks ?? 0) / impressions) * 100 : null,
      views,
      viewsPerDay: days ? views / days : 0,
      watchMinutes: ws.reduce((a, w) => a + w.watchMinutes, 0),
    };
  });
  const measured = variants.filter((v) => v.days > 0);
  if (measured.length < 2) return { metric, variants, winnerId: null, liftPct: null, confidence: null, note: "Not enough data yet — every variant needs at least one full window." };
  const key = (v: VariantResult) => (metric === "ctr" ? v.ctr ?? 0 : v.viewsPerDay);
  const ranked = [...measured].sort((a, b) => key(b) - key(a));
  const [best, second] = ranked;
  const liftPct = key(second) > 0 ? ((key(best) - key(second)) / key(second)) * 100 : null;
  let confidence: number | null = null;
  if (metric === "ctr" && best.impressions && second.impressions && best.clicks !== null && second.clicks !== null) {
    const p1 = best.clicks / best.impressions;
    const p2 = second.clicks / second.impressions;
    const p = (best.clicks + second.clicks) / (best.impressions + second.impressions);
    const se = Math.sqrt(p * (1 - p) * (1 / best.impressions + 1 / second.impressions));
    confidence = se > 0 ? normCdf((p1 - p2) / se) : null;
  }
  const note =
    metric === "ctr"
      ? confidence !== null && confidence >= 0.95
        ? "Clear winner on click-through rate (≥95% confidence)."
        : "Leading on click-through rate, but not yet statistically clear — run more cycles for certainty."
      : "YouTube did not expose impressions/CTR for this video, so variants are compared on views per day. Treat as directional.";
  return { metric, variants, winnerId: best.variantId, liftPct, confidence, note };
}
