import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, descriptionSignals, guessCategory, marketMeasures, type MarketSample } from "@/src/lib/market/signals";

const NOW = Date.parse("2026-09-24T00:00:00Z");
const day = 86_400_000;
function sample(i: number, o: Partial<MarketSample> = {}): MarketSample {
  return {
    videoId: `v${i}`, title: `Video ${i}`, channelId: `c${i}`, channelTitle: `Channel ${i}`,
    publishedAt: new Date(NOW - (10 + i * 7) * day).toISOString(), thumbnail: "", views: 100_000,
    durationSec: 600, channelSubs: 500_000, sponsored: false, affiliate: false, digital: false, ...o,
  };
}

describe("description signals", () => {
  it("detects sponsors, affiliate links and own products", () => {
    assert.deepEqual(descriptionSignals("This video is sponsored by Acme. Use code SAVE10", false), { sponsored: true, affiliate: false, digital: false });
    assert.equal(descriptionSignals("Gear: https://amzn.to/abc", false).affiliate, true);
    assert.equal(descriptionSignals("Join my course: https://x.teachable.com", false).digital, true);
    assert.equal(descriptionSignals("plain description", true).sponsored, true);
    assert.deepEqual(descriptionSignals("plain description", false), { sponsored: false, affiliate: false, digital: false });
  });
});

describe("market measures", () => {
  it("measures shares, formats and recency from the sample", () => {
    const s = [
      sample(0, { sponsored: true, durationSec: 45, publishedAt: new Date(NOW - 5 * day).toISOString() }),
      sample(1, { affiliate: true }),
      sample(2, { digital: true, durationSec: 1200 }),
      sample(3, { publishedAt: new Date(NOW - 150 * day).toISOString() }),
    ];
    const m = marketMeasures(s, 1000, NOW);
    assert.equal(m.sponsoredShare, 0.25);
    assert.equal(m.affiliateShare, 0.25);
    assert.equal(m.digitalShare, 0.25);
    assert.equal(m.shortsCount, 1);
    assert.equal(m.longCount, 3);
    assert.equal(m.recentShare, 0.75);
  });

  it("ranks a high-tier, well-monetised niche above a low-tier one with the same audience", () => {
    const rich = buildProfile({ name: "A", query: "a", region: "", category: "finance", samples: Array.from({ length: 10 }, (_, i) => sample(i, { sponsored: i < 4, affiliate: i < 5 })), totalResults: null, scannedAt: "", now: NOW });
    const poor = buildProfile({ name: "B", query: "b", region: "", category: "gaming", samples: Array.from({ length: 10 }, (_, i) => sample(i)), totalResults: null, scannedAt: "", now: NOW });
    assert.ok(rich.scores.earning > poor.scores.earning);
    assert.ok(rich.scores.overall > poor.scores.overall);
    assert.ok(rich.reasons[0].includes("estimate"));
  });

  it("returns empty-safe scores for an empty sample", () => {
    const p = buildProfile({ name: "C", query: "c", region: "", category: "food", samples: [], totalResults: 0, scannedAt: "", now: NOW });
    assert.equal(p.scores.demand, 0);
    assert.equal(p.scores.growth, 0);
    assert.deepEqual(p.angles, []);
  });

  it("guesses categories for custom niches", () => {
    assert.equal(guessCategory("dividend investing"), "finance");
    assert.equal(guessCategory("minecraft builds"), "gaming");
    assert.equal(guessCategory("home insurance tips"), "insurance");
  });
});
