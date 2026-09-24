import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyIntel, saveOutput } from "@/src/lib/intelligence/shelf";

describe("saved outputs", () => {
  it("keeps each tool's latest result per project, without touching other tools", () => {
    let intel = emptyIntel("p1");
    intel = saveOutput(intel, "thumbnail-concepts", "Concept A", "Thumbnail concepts", "2026-09-24T10:00:00.000Z");
    intel = saveOutput(intel, "repurpose-plan", "Clips", "Repurpose", "2026-09-24T10:01:00.000Z");
    intel = saveOutput(intel, "thumbnail-concepts", "Concept B", "Thumbnail concepts", "2026-09-24T10:02:00.000Z");
    assert.equal(intel.outputs?.["thumbnail-concepts"].text, "Concept B");
    assert.equal(intel.outputs?.["repurpose-plan"].text, "Clips");
    assert.equal(intel.updatedAt, "2026-09-24T10:02:00.000Z");
    assert.equal(intel.history[0].summary, "Thumbnail concepts generated.");
  });
});
