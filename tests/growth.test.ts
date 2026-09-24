import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { competitorStats, titleKeywords } from "@/src/lib/growth/competitors";
import { trendResult, velocity } from "@/src/lib/growth/trends";
import { abOutcome } from "@/src/lib/growth/abtest";
import { monthGrid, toIcs, addDays, type CalendarItem } from "@/src/lib/growth/calendar";
import { seal, open } from "@/src/server/secret-box";
import { __resetEnvCache } from "@/src/lib/env";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("competitor stats", () => {
  it("flags ≥3× outliers against the channel median and measures cadence", () => {
    const uploads = [10, 12, 9, 11, 50, 10].map((k, i) => ({ id: `v${i}`, title: `budget meals ${i}`, publishedAt: ago(3 + i * 3.5), views: k * 1000, durationSec: i === 0 ? 45 : 600 }));
    const s = competitorStats(uploads, NOW);
    assert.equal(s.medianViews, 10_500);
    assert.deepEqual(s.outliers.map((o) => o.id), ["v4"]);
    assert.equal(s.uploadsPerWeek, 2);
    assert.equal(s.lastUploadDaysAgo, 3);
    assert.ok(Math.abs(s.shortsShare - 1 / 6) < 1e-9);
  });

  it("extracts repeated title words, ignoring stopwords", () => {
    const k = titleKeywords(["How I Saved $500 on Groceries", "Groceries haul: saved money", "The best budget"]);
    assert.deepEqual(k.map((x) => x.word), ["saved", "groceries"]);
  });
});

describe("trend radar", () => {
  it("ranks by views per hour and marks new videos", () => {
    const s = (id: string, views: number, hours: number) => ({ videoId: id, title: `ai tools ${id}`, channelId: "c", channelTitle: "c", publishedAt: new Date(NOW - hours * 3_600_000).toISOString(), thumbnail: "", views, durationSec: 600, channelSubs: 1000 });
    const r = trendResult([s("a", 10_000, 100), s("b", 5_000, 10)], ["a"], NOW);
    assert.deepEqual(r.videos.map((v) => v.videoId), ["b", "a"]);
    assert.equal(r.videos[0].isNew, true);
    assert.equal(r.videos[1].isNew, false);
    assert.equal(velocity(3600, new Date(NOW - 3_600_000).toISOString(), NOW), 3600);
    assert.ok(r.phrases.some((p) => p.phrase === "ai tools"));
  });
});

describe("thumbnail A/B outcome", () => {
  it("picks the CTR winner with a significance estimate", () => {
    const o = abOutcome(
      [
        { variantId: "A", days: 2, metric: "ctr", impressions: 20_000, ctr: 4, views: 900, watchMinutes: 3000 },
        { variantId: "B", days: 2, metric: "ctr", impressions: 20_000, ctr: 6, views: 1300, watchMinutes: 4000 },
      ],
      ["A", "B"],
    );
    assert.equal(o.metric, "ctr");
    assert.equal(o.winnerId, "B");
    assert.ok((o.confidence ?? 0) > 0.99);
    assert.ok(Math.abs((o.liftPct ?? 0) - 50) < 0.01);
  });

  it("falls back to views/day and needs data for every variant", () => {
    const o = abOutcome([{ variantId: "A", days: 1, metric: "views", impressions: null, ctr: null, views: 100, watchMinutes: 1 }], ["A", "B"]);
    assert.equal(o.winnerId, null);
    const o2 = abOutcome(
      [
        { variantId: "A", days: 1, metric: "views", impressions: null, ctr: null, views: 100, watchMinutes: 1 },
        { variantId: "B", days: 2, metric: "views", impressions: null, ctr: null, views: 300, watchMinutes: 1 },
      ],
      ["A", "B"],
    );
    assert.equal(o2.metric, "views");
    assert.equal(o2.winnerId, "B");
    assert.equal(o2.confidence, null);
  });
});

describe("calendar", () => {
  it("builds a Monday-first 6-week grid", () => {
    const g = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    assert.equal(g.length, 42);
    assert.equal(g[0], "2026-08-31");
    assert.equal(g[1], "2026-09-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });

  it("exports valid ICS with escaped text", () => {
    const items: CalendarItem[] = [
      { id: "1", project_id: null, title: "Publish, part 1; final", kind: "publish", date: "2026-09-25", time: "", status: "planned", notes: "", remind: true },
      { id: "2", project_id: null, title: "Record", kind: "record", date: "2026-09-26", time: "14:30", status: "planned", notes: "Line1\nLine2", remind: true },
    ];
    const ics = toIcs(items, new Date(NOW));
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20260925"));
    assert.ok(ics.includes("DTEND;VALUE=DATE:20260926"));
    assert.ok(ics.includes("SUMMARY:[Publish] Publish\\, part 1\; final"));
    assert.ok(ics.includes("DTSTART:20260926T143000"));
    assert.ok(ics.includes("DESCRIPTION:Line1\\nLine2"));
  });
});

describe("secret box", () => {
  it("round-trips and rejects tampering", () => {
    process.env.ENCRYPTION_KEY = "test-key-for-secret-box";
    __resetEnvCache();
    const sealed = seal("refresh-token-123");
    assert.notEqual(sealed, "refresh-token-123");
    assert.equal(open(sealed), "refresh-token-123");
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    assert.throws(() => open(parts.join(".")));
  });
});
