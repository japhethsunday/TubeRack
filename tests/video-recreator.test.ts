import { test } from "node:test";
import assert from "node:assert/strict";
import { chaptersFrom } from "@/src/server/content/recreate";

test("recreator: reads the creator's chapters from a description", () => {
  const d = "Great video\n0:00 Intro\n1:23 - The mistake\n(12:05) Final result\n1:02:10 Bonus\nnot 5:00pm a chapter?";
  assert.deepEqual(chaptersFrom(d), ["0:00 Intro", "1:23 - The mistake", "(12:05) Final result", "1:02:10 Bonus"]);
  assert.deepEqual(chaptersFrom("no chapters here"), []);
});
