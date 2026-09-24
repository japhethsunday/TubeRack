import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INTELLIGENCE_TASKS,
  INTELLIGENCE_TASK_DEFS,
  canGenerateTransition,
  assertGenerateTransition,
  isActiveGeneration,
} from "@/src/lib/intelligence/tasks";
import {
  IntelligenceNotConfiguredError,
  requestIntelligence,
  currentModelInfo,
} from "@/src/lib/ai-gateway/intelligence";
import type { UsageKind } from "@/src/types/domain";

const VALID_KINDS: UsageKind[] = ["text", "image", "video", "voice", "music", "render", "transcription", "research"];

describe("intelligence tasks", () => {
  it("registers fourteen provider-independent tasks with routes and usage kinds", () => {
    assert.equal(INTELLIGENCE_TASKS.length, 14);
    for (const t of INTELLIGENCE_TASKS) {
      const def = INTELLIGENCE_TASK_DEFS[t];
      assert.equal(def.type, t);
      assert.ok(def.label.length > 0 && def.blurb.length > 0, t);
      assert.ok(def.route.startsWith("/intelligence") || def.route.startsWith("/studio"), t);
      assert.ok(VALID_KINDS.includes(def.usageKind), t);
    }
  });

  it("models the full generation lifecycle", () => {
    assert.equal(canGenerateTransition("idle", "preparing"), true);
    assert.equal(canGenerateTransition("preparing", "generating"), true);
    assert.equal(canGenerateTransition("generating", "completed"), true);
    assert.equal(canGenerateTransition("generating", "cancelled"), true);
    assert.equal(canGenerateTransition("completed", "generating"), true);
    assert.equal(canGenerateTransition("idle", "completed"), false);
    assert.throws(() => assertGenerateTransition("idle", "completed"));
    assert.equal(isActiveGeneration("preparing"), true);
    assert.equal(isActiveGeneration("generating"), true);
    assert.equal(isActiveGeneration("completed"), false);
  });

  it("refuses provider execution with an explicit boundary error", async () => {
    const err = new IntelligenceNotConfiguredError("title-analysis");
    assert.equal(err.code, "INTELLIGENCE_NOT_CONFIGURED");
    assert.equal(err.task, "title-analysis");
    assert.ok(err.message.includes("Phase 11"));
    await assert.rejects(() => requestIntelligence({ task: "hook-analysis", context: {} }), IntelligenceNotConfiguredError);
    assert.equal(currentModelInfo(), null);
  });
});
