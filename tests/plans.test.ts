import { test } from "node:test";
import assert from "node:assert/strict";
import { atLeast, featureForPath, FEATURES, tierOf } from "@/src/lib/plans";

test("plan follows the monthly allowance", () => {
  assert.equal(tierOf(null), "free");
  assert.equal(tierOf({ monthlyGrant: 100 }), "free");
  assert.equal(tierOf({ monthlyGrant: 500 }), "creator");
  assert.equal(tierOf({ monthlyGrant: 1000 }), "creator");
  assert.equal(tierOf({ monthlyGrant: 3000 }), "pro");
  assert.equal(tierOf({ monthlyGrant: 7000 }), "studio");
  assert.equal(tierOf({ monthlyGrant: 100, unlimited: true }), "studio");
});

test("locked pages map to the right plan", () => {
  assert.equal(featureForPath("/intelligence/competitors"), "competitors");
  assert.equal(featureForPath("/studio/abtest/x"), "abtest");
  assert.equal(featureForPath("/content-creator"), null);
  assert.equal(featureForPath("/intelligence/niche"), null);
  assert.equal(featureForPath("/calendarx"), null);
  assert.ok(!atLeast("free", FEATURES.storyboard.tier));
  assert.ok(atLeast("creator", FEATURES.storyboard.tier));
  assert.ok(!atLeast("creator", FEATURES["channel-creator"].tier));
  assert.ok(atLeast("studio", FEATURES.abtest.tier));
});
