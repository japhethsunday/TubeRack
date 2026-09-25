import { test } from "node:test";
import assert from "node:assert/strict";
import { captionsFromSegments } from "@/src/lib/video/build";

test("captions never overlap and stay in order", () => {
  const out = captionsFromSegments(
    [
      { startSec: 2, endSec: 5, text: "second" },
      { startSec: 0, endSec: 2.6, text: "first" },
      { startSec: 4, endSec: 7, text: "third" },
    ],
    10,
  );
  assert.deepEqual(out.map((c) => c.text), ["first", "second", "third"]);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].startSec >= out[i - 1].startSec + out[i - 1].durationSec - 1e-6);
  assert.equal(out[0].startSec, 10);
});

test("captions follow the voice clip's trim and speed and stay inside it", () => {
  const out = captionsFromSegments(
    [
      { startSec: 0, endSec: 4, text: "trimmed away" },
      { startSec: 4, endSec: 8, text: "kept" },
      { startSec: 30, endSec: 40, text: "past the end" },
    ],
    100,
    { durationSec: 10, inSec: 4, speed: 2 },
  );
  assert.deepEqual(out.map((c) => c.text), ["kept"]);
  assert.equal(out[0].startSec, 100);
  assert.equal(out[0].durationSec, 2);
});
