import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickCombos, ANGLES } from "@/src/server/growth/promo-autopilot";
import { PROMO_FEATURES, PROMO_STYLES } from "@/src/server/growth/promo";

describe("promo autopilot", () => {
  it("picks distinct features, styles and a known angle", () => {
    const out = pickCombos(5, [], 123456789);
    assert.equal(out.length, 5);
    assert.equal(new Set(out.map((c) => c.feature)).size, 5);
    for (const c of out) {
      assert.ok(PROMO_FEATURES.some((f) => f.id === c.feature));
      assert.ok((PROMO_STYLES as readonly string[]).includes(c.style));
      assert.ok(ANGLES.includes(c.angle));
    }
  });
  it("avoids combinations used in the last two weeks", () => {
    const recent = PROMO_FEATURES.slice(0, 5).flatMap((f) => PROMO_STYLES.map((style) => ({ feature: f.id, style })));
    const out = pickCombos(2, recent, 42);
    for (const c of out) assert.ok(!recent.some((r) => r.feature === c.feature && r.style === c.style));
  });
  it("still returns promos when everything was used recently", () => {
    const all = PROMO_FEATURES.flatMap((f) => PROMO_STYLES.map((style) => ({ feature: f.id, style })));
    assert.equal(pickCombos(3, all, 7).length, 3);
  });
});

describe("promo style mix", () => {
  it("makes 3 of every 4 videos teaching Shorts", async () => {
    const { styleFor, TEACHING_STYLES } = await import("@/src/server/growth/promo");
    for (const seed of [0, 12345678, 99999999999]) {
      const styles = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => styleFor(i, seed));
      assert.equal(styles.filter((s) => TEACHING_STYLES.has(s)).length, 6);
      assert.ok(!TEACHING_STYLES.has(styles[3]) && !TEACHING_STYLES.has(styles[7]));
    }
  });
});

describe("release schedule", () => {
  it("posts the first now and the rest one per day at 5 PM", async () => {
    const { releaseSlot } = await import("@/src/lib/video/publish");
    const now = new Date(2026, 8, 30, 21, 15);
    assert.equal(releaseSlot(0, now), "");
    assert.equal(releaseSlot(1, now), "2026-10-01T17:00");
    assert.equal(releaseSlot(2, now), "2026-10-02T17:00");
  });
});
