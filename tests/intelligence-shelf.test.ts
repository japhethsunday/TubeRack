import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetIntelIds,
  emptyIntel,
  saveOpportunity,
  setOpportunityStatus,
  saveAudience,
  saveStrategy,
  addIntelItem,
  editIntelItem,
  setIntelItemStatus,
  addRetentionRecord,
  saveBrief,
  intelCounts,
} from "@/src/lib/intelligence/shelf";
import { emptyAudienceProfile, emptyStrategyBrief } from "@/src/lib/intelligence/profiles";

describe("intelligence shelf", () => {
  beforeEach(() => __resetIntelIds());

  it("saves opportunities and tracks candidate lifecycle", () => {
    let list = saveOpportunity([], {
      title: "Payoff-first hooks",
      topic: "Hooks",
      angle: "Tutorial",
      audience: "Creators",
      reasoning: "Searchable + demonstrable.",
      format: "Tutorial",
      hook: "Fix your hook in 8 seconds",
      sourceTask: "topic-discovery",
    }, { id: "o1" });
    assert.equal(list[0].status, "candidate");
    list = setOpportunityStatus(list, "o1", "chosen");
    assert.equal(list[0].status, "chosen");
  });

  it("versions audience, strategy, briefs, and reviews", () => {
    let intel = emptyIntel("p1");
    intel = saveAudience(intel, { ...emptyAudienceProfile(), primary: "Creators" });
    intel = saveStrategy(intel, { ...emptyStrategyBrief(), promise: "Fix hooks" });
    intel = saveBrief(intel, "# brief");
    intel = addIntelItem(intel, "titles", "Fix your hook fast", "Benefit", { id: "t1" });
    intel = addIntelItem(intel, "hooks", "Stop greeting viewers", "Contrarian", { id: "h1" });
    intel = setIntelItemStatus(intel, "titles", "t1", "approved");
    intel = editIntelItem(intel, "hooks", "h1", "Stop greeting viewers cold");
    intel = addRetentionRecord(intel, { summary: "3 beats", flags: [], estimateMinutes: 2 }, { id: "r1" });

    const counts = intelCounts(intel);
    assert.equal(counts.hasAudience, true);
    assert.equal(counts.hasStrategy, true);
    assert.equal(counts.titles, 1);
    assert.equal(counts.hooks, 1);
    assert.equal(counts.approved, 1);
    assert.equal(counts.retention, 1);
    assert.equal(intel.hooks[0].text, "Stop greeting viewers cold");
    assert.equal(intel.hooks[0].status, "draft");
    assert.ok(intel.history.length >= 7);
    assert.equal(intel.history.length <= 50, true);
    assert.throws(() => addIntelItem(intel, "titles", "   ", "x"));
    assert.throws(() => editIntelItem(intel, "titles", "t1", "  "));
  });
});
