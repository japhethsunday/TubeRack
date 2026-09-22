import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sum,
  engagementRate,
  growthRate,
  average,
  groupBy,
  splitPeriod,
  sampleGate,
  formatDelta,
  formatCompact,
  MIN_SAMPLE,
} from "@/src/lib/analytics/metrics";
import { bucketByDay, linePath, areaPath, barLayout, yTicks, chartBounds } from "@/src/lib/analytics/charts";
import { analyzeFormats, analyzeTopics, analyzePackaging, formatTable } from "@/src/lib/analytics/insights";
import { computeAlerts, SWING_THRESHOLD_PCT, STALE_AFTER_DAYS } from "@/src/lib/analytics/alerts";
import { emptyAnalyticsBundle, parseAnalyticsBundle, entriesToCsv } from "@/src/lib/analytics/storage";
import type { PerformanceEntry } from "@/src/lib/analytics/types";

function entry(overrides: Partial<PerformanceEntry> = {}): PerformanceEntry {
  return {
    id: "e1",
    projectId: "p1",
    platform: "youtube",
    date: "2026-08-01",
    views: 1000,
    provenance: "manual",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("analytics metrics", () => {
  it("sums, rates, growth, and grouping without inventing", () => {
    const entries = [
      entry({ id: "a", views: 1000, likes: 50, comments: 10, shares: 5 }),
      entry({ id: "b", views: 3000, likes: 90, comments: 20, shares: 10 }),
    ];
    assert.equal(sum(entries, (e) => e.views), 4000);
    assert.equal(engagementRate(entries), ((50 + 10 + 5 + 90 + 20 + 10) / 4000) * 100);
    assert.equal(engagementRate([]), null);
    assert.equal(growthRate(120, 100), 20);
    assert.equal(growthRate(50, 0), null);
    assert.equal(average([]), null);
    assert.equal(average([2, 4]), 3);
    assert.equal(groupBy(entries, (e) => e.platform).get("youtube")?.length, 2);
    assert.equal(formatDelta(null), "n/a (no baseline)");
    assert.ok(formatDelta(18.445).startsWith("+18.4"));
    assert.equal(formatCompact(1500), "1.5K");
    assert.equal(formatCompact(999), "999");
    assert.equal(MIN_SAMPLE, 3);
  });

  it("splits current vs previous windows with unambiguous labels", () => {
    const now = new Date("2026-09-01T00:00:00").getTime();
    const entries = [
      entry({ id: "a", date: "2026-08-20" }),
      entry({ id: "b", date: "2026-07-15" }),
    ];
    const split = splitPeriod(entries, 28, now);
    assert.deepEqual(split.current.map((e) => e.id), ["a"]);
    assert.deepEqual(split.previous.map((e) => e.id), ["b"]);
    assert.equal(split.currentLabel, "last 28 days");
    assert.equal(split.previousLabel, "previous 28 days");
  });

  it("gates interpretations on sample size", () => {
    assert.equal(sampleGate(1, "formats").ok, false);
    assert.ok(sampleGate(1, "formats").message.includes("Interpretations unlock at 3"));
    assert.equal(sampleGate(5, "formats").ok, true);
  });
});

describe("chart math", () => {
  it("buckets, paths, bars, and ticks deterministically", () => {
    assert.deepEqual(bucketByDay([
      { at: "2026-08-02", value: 5 },
      { at: "2026-08-01", value: 3 },
      { at: "2026-08-01", value: 2 },
    ]), [
      { at: "2026-08-01", value: 5 },
      { at: "2026-08-02", value: 5 },
    ]);
    const geom = { width: 560, height: 180, padding: 28 };
    assert.ok(linePath([0, 10], geom).startsWith("M"));
    assert.equal(linePath([], geom), "");
    assert.ok(areaPath([0, 10], geom).endsWith("Z"));
    const bars = barLayout([{ label: "a", value: 50 }, { label: "b", value: 100 }]);
    assert.equal(bars[1].fraction, 1);
    assert.equal(bars[0].fraction, 0.5);
    assert.deepEqual(chartBounds([]), { min: 0, max: 1 });
    assert.ok(yTicks(1000).length >= 2);
    assert.deepEqual(yTicks(0), [0]);
  });
});

describe("local insights", () => {
  const formatOf = (id: string) => (id.startsWith("t") ? "Tutorial" : "Commentary");
  const topicOf = (id: string) => (id.startsWith("t") ? "Hooks" : "Vlogs");

  it("compares formats with evidence and gates", () => {
    const one = analyzeFormats([entry({ id: "a", projectId: "t1" })], formatOf);
    assert.equal(one.length, 1);
    assert.equal(one[0].gated, true);
    const many = analyzeFormats(
      [1, 2, 3].map((i) => entry({ id: `t${i}`, projectId: "t1", views: 5000 })).concat(
        [1, 2, 3].map((i) => entry({ id: `c${i}`, projectId: "c1", views: 1000 })),
      ),
      formatOf,
    );
    assert.equal(many[0].gated, false);
    assert.ok(many[0].observation.includes("Tutorial"));
    assert.ok(many[0].evidence.includes("3 Tutorial"));
    assert.ok(!JSON.stringify(many).match(/guarantee|predict/i));
  });

  it("ranks topics and tabulates formats", () => {
    const insights = analyzeTopics(
      [entry({ id: "a", projectId: "t1", views: 9000 }), entry({ id: "b", projectId: "c1", views: 1000 })],
      topicOf,
    );
    assert.ok(insights[0].observation.includes("Hooks"));
    const table = formatTable(
      [entry({ id: "a", projectId: "t1", views: 9000, watchHours: 10 }), entry({ id: "b", projectId: "c1", views: 1000 })],
      formatOf,
    );
    assert.equal(table[0].format, "Tutorial");
    assert.equal(table[0].avgWatchHours, 10);
  });

  it("reads packaging only from logged CTR", () => {
    const gated = analyzePackaging([{ projectId: "p1", projectName: "Ep 1", views: 100, impressions: 0, ctr: null, entries: 1 }]);
    assert.equal(gated[0].gated, true);
    const read = analyzePackaging([
      { projectId: "p1", projectName: "Ep 1", title: "Hooks", views: 5000, impressions: 50000, ctr: 6.2, entries: 2 },
      { projectId: "p2", projectName: "Ep 2", title: "Vlog", views: 1000, impressions: 20000, ctr: 3.1, entries: 2 },
      { projectId: "p3", projectName: "Ep 3", title: "More", views: 2000, impressions: 30000, ctr: 4.0, entries: 2 },
    ]);
    assert.ok(read[0].observation.includes("Ep 1"));
    assert.ok(read[0].implication.includes("Associated with"));
    assert.ok(!JSON.stringify(read).match(/caused the|causes|drove the lift/i));
  });
});

describe("alert rules", () => {
  it("fires milestone, swing, and stale from real signals only", () => {
    assert.deepEqual(computeAlerts([]), []);
    const now = new Date("2026-09-01T00:00:00").getTime();
    const single = computeAlerts([entry({ id: "a", date: "2026-08-28" })], now);
    assert.ok(single.some((a) => a.kind === "milestone"));
    assert.ok(!single.some((a) => a.kind === "stale"));

    const swing = computeAlerts(
      [entry({ id: "a", date: "2026-08-20", views: 1000 }), entry({ id: "b", date: "2026-08-28", views: 2000 })],
      now,
    );
    assert.ok(swing.some((a) => a.kind === "swing" && a.title.includes("surged")));
    assert.ok(swing.every((a) => a.rule.includes("50") || a.rule.includes("first")));

    const stale = computeAlerts([entry({ id: "a", date: "2026-01-01", views: 10 })], now);
    assert.ok(stale.some((a) => a.kind === "stale"));
    assert.equal(SWING_THRESHOLD_PCT, 50);
    assert.equal(STALE_AFTER_DAYS, 30);
  });
});

describe("analytics storage + reports", () => {
  it("round-trips bundles and exports honest CSV", () => {
    const bundle = emptyAnalyticsBundle();
    assert.deepEqual(parseAnalyticsBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parseAnalyticsBundle({}), /analytics file/);
    assert.throws(() => parseAnalyticsBundle({ version: 1, entries: [{ id: 1 }], retention: [], signals: [], snapshots: [] }), /analytics file/);

    const csv = entriesToCsv(
      [entry({ id: "a", projectId: "p1", views: 1500, ctr: 5.5 }), entry({ id: "b", projectId: "p2", platform: "tiktok", views: 200, notes: 'Said "wow", really' })],
      (id) => (id === "p1" ? "Ep 1" : "Ep, 2"),
    );
    const lines = csv.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes("provenance"));
    assert.ok(lines[1].includes("manual"));
    assert.ok(lines[2].includes('"Ep, 2"'));
    assert.ok(lines[2].includes('"Said ""wow"", really"'));
  });
});
