import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextStage,
  previousStage,
  assertCanAdvance,
  allStages,
} from "@/src/lib/project/lifecycle";

describe("project lifecycle", () => {
  it("covers the full idea -> improvement pipeline", () => {
    const stages = allStages();
    assert.equal(stages[0], "idea");
    assert.equal(stages[stages.length - 1], "improvement");
    assert.equal(stages.length, 15);
  });

  it("advances exactly one stage at a time", () => {
    assert.equal(nextStage("idea"), "research");
    assert.equal(previousStage("research"), "idea");
    assert.equal(nextStage("improvement"), null);
    assert.doesNotThrow(() => assertCanAdvance("idea", "research"));
    assert.throws(() => assertCanAdvance("idea", "script"));
  });
});
