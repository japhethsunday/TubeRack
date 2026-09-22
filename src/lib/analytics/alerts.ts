import type { AnalyticsAlert, PerformanceEntry } from "@/src/lib/analytics/types";

/**
 * Alert rules — disclosed thresholds, real signals only.
 * Milestone: first logged entry. Swing: latest vs previous views ≥50%.
 * Stale: nothing logged for 30 days. Nothing else triggers.
 */

export const SWING_THRESHOLD_PCT = 50;
export const STALE_AFTER_DAYS = 30;

export function computeAlerts(entries: PerformanceEntry[], nowMs?: number): AnalyticsAlert[] {
  const alerts: AnalyticsAlert[] = [];
  const now = nowMs ?? Date.now();

  if (entries.length === 0) return alerts;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  alerts.push({
    id: `alert_milestone_${first.id}`,
    kind: "milestone",
    title: "First performance logged",
    detail: `Tracking started with “${first.date}”. Every trend here builds from manual entries.`,
    rule: "Fires once first manual entry exists.",
    createdAt: new Date().toISOString(),
  });

  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];
    if (prev.views > 0) {
      const delta = ((latest.views - prev.views) / prev.views) * 100;
      if (Math.abs(delta) >= SWING_THRESHOLD_PCT) {
        alerts.push({
          id: `alert_swing_${latest.id}`,
          kind: "swing",
          title: `Views ${delta > 0 ? "surged" : "dropped"} ${Math.abs(delta).toFixed(0)}% between logs`,
          detail: `${prev.views.toLocaleString()} (${prev.date}) → ${latest.views.toLocaleString()} (${latest.date}). A swing, not a diagnosis — investigate packaging, topic, and timing before concluding.`,
          rule: `Fires when consecutive logged views move ≥${SWING_THRESHOLD_PCT}%.`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  const latestMs = Math.max(...entries.map((e) => new Date(`${e.date}T00:00:00`).getTime()));
  if (now - latestMs > STALE_AFTER_DAYS * 86400000) {
    alerts.push({
      id: "alert_stale",
      kind: "stale",
      title: "Logging went stale",
      detail: `No entries for over ${STALE_AFTER_DAYS} days. Trends pause until fresh logs arrive — nothing is extrapolated.`,
      rule: `Fires when the newest entry is older than ${STALE_AFTER_DAYS} days.`,
      createdAt: new Date().toISOString(),
    });
  }
  return alerts;
}
