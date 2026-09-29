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
