import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  assertTransition,
  isTerminal,
} from "@/src/lib/jobs/machine";

describe("job state machine", () => {
  it("allows queued -> processing -> completed", () => {
    assert.equal(canTransition("queued", "processing"), true);
    assert.equal(canTransition("processing", "completed"), true);
  });

  it("rejects illegal jumps like queued -> completed", () => {
    assert.equal(canTransition("queued", "completed"), false);
    assert.throws(() => assertTransition("queued", "completed"));
  });

  it("supports failure, retry, cancel, and re-queue recovery", () => {
    assert.equal(canTransition("processing", "failed"), true);
    assert.equal(canTransition("failed", "retrying"), true);
    assert.equal(canTransition("retrying", "processing"), true);
    assert.equal(canTransition("failed", "queued"), true);
    assert.equal(canTransition("cancelled", "queued"), true);
  });

  it("marks completed/cancelled terminal only", () => {
    assert.equal(isTerminal("completed"), true);
    assert.equal(isTerminal("cancelled"), true);
    assert.equal(isTerminal("failed"), false);
    assert.equal(isTerminal("retrying"), false);
  });
});
