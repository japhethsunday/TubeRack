import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aspectForPlatform, productionContext } from "@/src/lib/projects/production-context";

describe("production context", () => {
  it("picks vertical frames for Shorts and horizontal otherwise", () => {
    assert.equal(aspectForPlatform("YouTube Shorts"), "9:16");
    assert.equal(aspectForPlatform("YouTube", "Short"), "9:16");
    assert.equal(aspectForPlatform("YouTube", "Long-form video"), "16:9");
  });

  it("builds one brief from the project, channel DNA and strategy", () => {
    const ctx = productionContext({
      project: { id: "p", name: "Savings", topic: "Beating inflation", description: "", goal: "Grow subscribers", platform: "YouTube", contentType: "Long-form video", channelId: "c" } as never,
      dna: { tone: "calm, practical", visualIdentity: "clean desk shots, warm light", avoidWords: "get rich quick", audience: "young earners" } as never,
      intel: { strategy: { angle: "Small steps beat big bets", promise: "A plan you can start today", hook: "" }, audience: { primary: "first-job savers" } } as never,
    });
    assert.equal(ctx.topic, "Beating inflation");
    assert.equal(ctx.audience, "first-job savers");
    assert.equal(ctx.aspect, "16:9");
    for (const part of ["Beating inflation", "Small steps beat big bets", "first-job savers", "calm, practical", "warm light", "get rich quick"]) {
      assert.ok(ctx.brief.includes(part), `brief should mention ${part}`);
    }
  });
});
