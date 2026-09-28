import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribe } from "@/src/server/unsubscribe";

describe("one-click unsubscribe", () => {
  afterEach(() => __resetEnvCache());
  it("signs links per address and rejects tampering", () => {
    process.env.JWT_SECRET = "test-secret-for-unsubscribe-links-0123456789";
    __resetEnvCache();
    const t = unsubscribeToken("Ada@Example.com");
    assert.ok(verifyUnsubscribe("ada@example.com", t));
    assert.equal(verifyUnsubscribe("bob@example.com", t), false);
    assert.equal(verifyUnsubscribe("ada@example.com", "x"), false);
    assert.match(unsubscribeUrl("ada@example.com") ?? "", /\/api\/v1\/email\/unsubscribe\?e=ada%40example\.com&t=/);
  });
});
