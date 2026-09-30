import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseAt } from "@/src/lib/video/publish";

const at = (h: number, m = 0) => { const d = new Date(2026, 8, 30, h, m); return d; };

test("now: first immediately, rest daily at 5 PM", () => {
  assert.equal(releaseAt(0, "now", 0, at(10)), null);
  const r = releaseAt(2, "now", 0, at(10))!;
  assert.deepEqual([r.getDate(), r.getHours()], [2, 17]);
});

test("afternoon starts today when 2 PM is still ahead", () => {
  const r = releaseAt(0, "afternoon", 0, at(10))!;
  assert.deepEqual([r.getDate(), r.getHours()], [30, 14]);
  const r4 = releaseAt(4, "afternoon", 0, at(10))!;
  assert.deepEqual([r4.getMonth(), r4.getDate(), r4.getHours()], [9, 4, 14]);
});

test("morning after 9 AM begins tomorrow", () => {
  const r = releaseAt(0, "morning", 0, at(10))!;
  assert.deepEqual([r.getMonth(), r.getDate(), r.getHours()], [9, 1, 9]);
  const e = releaseAt(1, "evening", 2, at(10))!;
  assert.deepEqual([e.getMonth(), e.getDate(), e.getHours()], [9, 3, 19]);
});
