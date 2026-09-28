import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCode } from "@/src/server/growth/codes";
import { WELCOME_STEPS } from "@/src/server/growth/lifecycle";

test("codes are normalised to upper-case letters, numbers, - and _", () => {
  assert.equal(normalizeCode(" creator50 "), "CREATOR50");
  assert.equal(normalizeCode("bonus-7k3q!"), "BONUS-7K3Q");
});

test("welcome series: five steps in day order, each with a sender and subject", () => {
  assert.deepEqual(WELCOME_STEPS.map((s) => s.day), [0, 1, 2, 4, 7]);
  const p = { id: "x", email: "a@b.c", name: "Ada Lovelace" };
  for (const s of WELCOME_STEPS) {
    assert.ok(s.from.length > 0 && s.subject(p).length > 0);
    assert.ok(s.layout(p).heading.length > 0);
  }
});
