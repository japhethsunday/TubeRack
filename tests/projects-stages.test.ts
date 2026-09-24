import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextStage, stageAt, stageHref } from "@/src/lib/projects/stages";

describe("pipeline stages", () => {
  it("maps pages back to stages, including tabs", () => {
    assert.equal(stageAt("/studio/script", null), "script");
    assert.equal(stageAt("/studio/media", "voice"), "voice");
    assert.equal(stageAt("/studio/media", null), "voice");
    assert.equal(stageAt("/studio/package", "seo"), "seo");
    assert.equal(stageAt("/dashboard", null), null);
  });
  it("walks to the next distinct tool", () => {
    assert.equal(nextStage("script"), "storyboard");
    assert.equal(nextStage("music"), "video");
    assert.equal(nextStage("video"), "thumbnail");
    assert.equal(nextStage("analytics"), null); // improvement opens the same page
    assert.ok(stageHref("voice", "p1").includes("tab=voice"));
  });
});
