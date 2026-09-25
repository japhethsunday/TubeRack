import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { duplicateClip, freeSlot, insertClip } from "@/src/lib/video/ops";
import type { TimelineClip } from "@/src/lib/video/types";

const clip = (id: string, trackId: string, startSec: number, durationSec: number): TimelineClip =>
  ({ id, trackId, kind: "video", name: id, startSec, durationSec, volume: 1, fadeInSec: 0, fadeOutSec: 0, muted: false }) as TimelineClip;
const spans = (cs: TimelineClip[], track: string) =>
  cs.filter((c) => c.trackId === track).sort((a, b) => a.startSec - b.startSec).map((c) => [c.name, c.startSec, c.durationSec]);

describe("insertClip", () => {
  it("main track: adding at the playhead over a clip inserts after it and pushes later clips", () => {
    const base = [clip("a", "v", 0, 4), clip("b", "v", 4, 3)];
    const out = insertClip(base, { ...clip("n", "v", 0, 2) }, true);
    assert.deepEqual(spans(out, "v"), [["n", 0, 2], ["a", 2, 4], ["b", 6, 3]]);
    const mid = insertClip(base, { ...clip("m", "v", 2, 2) }, true);
    assert.deepEqual(spans(mid, "v"), [["a", 0, 4], ["m", 4, 2], ["b", 6, 3]]);
  });

  it("other tracks: uses the first free gap, never overlapping", () => {
    const base = [clip("t1", "text", 0, 3), clip("t2", "text", 5, 3)];
    assert.equal(freeSlot(base, "text", 0, 2), 3);
    assert.equal(freeSlot(base, "text", 0, 3), 8);
    const out = insertClip(base, { ...clip("n", "text", 1, 2) });
    assert.deepEqual(spans(out, "text")[1], ["n", 3, 2]);
  });
});

describe("duplicateClip", () => {
  it("main track: the copy follows the original and later clips move right", () => {
    const base = [clip("a", "v", 0, 4), clip("b", "v", 4, 3)];
    const out = duplicateClip(base, "a", true);
    assert.deepEqual(spans(out, "v"), [["a", 0, 4], ["a (copy)", 4, 4], ["b", 8, 3]]);
  });

  it("other tracks: the copy never lands on another clip", () => {
    const base = [clip("a", "text", 0, 2), clip("b", "text", 2, 2)];
    const out = duplicateClip(base, "a");
    const copy = out.find((c) => c.name === "a (copy)")!;
    assert.equal(copy.startSec, 4);
  });
});
