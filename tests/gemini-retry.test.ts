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

  it("retries a brief rate-limit on the same model", async () => {
    const seen: string[] = [];
    const out = await withModelFallback("a", ["b"], async (m) => {
      seen.push(m);
      if (seen.length === 1) throw new Error("429 Too Many Requests");
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

describe("gemini quota", () => {
  it("treats limit: 0 quota as non-retryable and moves to the next model", async () => {
    const q = new Error('429 RESOURCE_EXHAUSTED Quota exceeded for metric: generate_content_free_tier_requests, limit: 0');
    let calls = 0;
    const out = await withModelFallback("a", ["b"], async (m) => {
      calls++;
      if (m === "a") throw q;
      return m;
    }, opts);
    assert.equal(out, "b");
    assert.equal(calls, 2);
    await assert.rejects(withModelFallback("a", [], async () => { throw q; }, opts), /limit: 0/);
  });
});

describe("overload failover", () => {
  it("moves to the next model on 503 without retrying the busy one", async () => {
    const { withModelFallback } = await import("@/src/server/ai/gemini");
    const calls: string[] = [];
    const out = await withModelFallback("a", ["b"], async (m) => {
      calls.push(m);
      if (m === "a") throw new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
      return m;
    }, { baseDelayMs: 1 });
    assert.equal(out, "b");
    assert.deepEqual(calls, ["a", "b"]);
  });
});

describe("slow model failover", () => {
  it("gives up on a model that doesn't answer in time and uses the next one", async () => {
    const calls: string[] = [];
    const out = await withModelFallback("slow", ["fast"], async (m) => {
      calls.push(m);
      if (m === "slow") await new Promise((r) => setTimeout(r, 500));
      return m;
    }, { attemptMs: 50, baseDelayMs: 1 });
    assert.equal(out, "fast");
    assert.deepEqual(calls, ["slow", "fast"]);
  });
});
