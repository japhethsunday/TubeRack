import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { median, nicheMetrics, nicheScores, type NicheVideoSample } from "@/src/lib/niche/score";

const NOW = Date.parse("2026-09-24T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const v = (views: number, subs: number | null, age = 30, dur: number | null = 600, ch = `c${Math.random()}`): NicheVideoSample => ({
  videoId: "x", title: "t", channelId: ch, channelTitle: "c", publishedAt: daysAgo(age), thumbnail: "", views, durationSec: dur, channelSubs: subs,
});

describe("niche scoring", () => {
  it("computes medians", () => {
    assert.equal(median([]), 0);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it("measures small-channel winners and shares from real numbers", () => {
    const m = nicheMetrics([v(500_000, 20_000), v(30_000, 50_000), v(2_000_000, 5_000_000), v(90_000, 10_000, 10, 45)], null, NOW);
    assert.equal(m.sampleSize, 4);
    assert.equal(m.smallChannelWinners, 2);
    assert.equal(m.bigChannelShare, 0.25);
    assert.equal(m.shortsShare, 0.25);
    assert.equal(m.smallChannelShare, 0.75);
  });

  it("ranks an open niche above a crowded one", () => {
    const open = nicheScores(nicheMetrics(Array.from({ length: 10 }, () => v(300_000, 30_000)), null, NOW));
    const crowded = nicheScores(nicheMetrics(Array.from({ length: 10 }, () => v(300_000, 8_000_000)), null, NOW));
    assert.ok(open.overall > crowded.overall);
    assert.ok(crowded.competition > open.competition);
    assert.equal(open.verdict, "Strong opportunity");
  });

  it("flags low demand and handles empty samples", () => {
    assert.equal(nicheScores(nicheMetrics(Array.from({ length: 5 }, () => v(200, 1_000, 100)), null, NOW)).verdict, "Low demand");
    assert.equal(nicheScores(nicheMetrics([], null, NOW)).overall, 0);
  });
});
