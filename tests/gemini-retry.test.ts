import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTransient, withModelFallback } from "@/src/server/ai/gemini";

const busy = () => new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
const opts = { retries: 1, baseDelayMs: 1, budgetMs: 5000 };

describe("gemini retry", () => {
  it("detects transient errors", () => {
    assert.equal(isTransient(busy()), true);
    assert.equal(isTransient(new Error("429 RESOURCE_EXHAUSTED")), true);
    assert.equal(isTransient(new Error("400 INVALID_ARGUMENT")), false);
  });

  it("retries then succeeds on the same model", async () => {
    const seen: string[] = [];
    const out = await withModelFallback("a", ["b"], async (m) => {
      seen.push(m);
      if (seen.length === 1) throw busy();
      return "ok";
    }, opts);
    assert.equal(out, "ok");
    assert.deepEqual(seen, ["a", "a"]);
  });

  it("falls back to the next model when one stays busy", async () => {
    const out = await withModelFallback("a", ["b"], async (m) => {
      if (m === "a") throw busy();
      return m;
    }, opts);
    assert.equal(out, "b");
  });

  it("does not retry non-transient errors", async () => {
    let calls = 0;
    await assert.rejects(
      withModelFallback("a", ["b"], async () => {
        calls++;
        throw new Error("400 INVALID_ARGUMENT");
      }, opts),
      /INVALID_ARGUMENT/,
    );
    assert.equal(calls, 1);
  });
});

describe("gemini retired models", () => {
  it("skips a retired model and reports busy over a later 404", async () => {
    const retired = new Error('{"error":{"code":404,"message":"This model models/gemini-2.5-flash-lite is no longer available to new users."}}');
    const out = await withModelFallback("a", ["old", "b"], async (m) => {
      if (m === "old") throw retired;
      if (m === "a") throw busy();
      return m;
    }, opts);
    assert.equal(out, "b");
    await assert.rejects(
      withModelFallback("a", ["old"], async (m) => {
        throw m === "a" ? busy() : retired;
      }, opts),
      /high demand/,
    );
  });
});
