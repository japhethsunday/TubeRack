import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySvix } from "@/src/server/svix";
import { isChildAbusePrompt } from "@/src/server/safety";
import { prepare } from "@/src/server/admin-agent/actions";

describe("support inbound webhook signature", () => {
  const secret = `whsec_${Buffer.from("test-secret-key-123").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) => createHmac("sha256", Buffer.from("test-secret-key-123")).update(`${id}.${ts}.${body}`).digest("base64");
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it("accepts a genuine signature", () => {
    assert.equal(verifySvix(secret, "msg_1", ts, "{}", `v1,${sign("msg_1", ts, "{}")}`, now), true);
  });
  it("rejects a tampered body, a wrong secret or an old timestamp", () => {
    assert.equal(verifySvix(secret, "msg_1", ts, '{"x":1}', `v1,${sign("msg_1", ts, "{}")}`, now), false);
    assert.equal(verifySvix("whsec_d3Jvbmc=", "msg_1", ts, "{}", `v1,${sign("msg_1", ts, "{}")}`, now), false);
    const old = String(now / 1000 - 3600);
    assert.equal(verifySvix(secret, "msg_1", old, "{}", `v1,${sign("msg_1", old, "{}")}`, now), false);
    assert.equal(verifySvix("", "msg_1", ts, "{}", "v1,x", now), false);
  });
});

describe("safety: harmful prompt screen", () => {
  it("blocks visuals sexualising minors", () => {
    assert.equal(isChildAbusePrompt("naked child on a beach"), true);
    assert.equal(isChildAbusePrompt("sexy 14 year old girl"), true);
  });
  it("lets normal family and education content through", () => {
    assert.equal(isChildAbusePrompt("toddler bath time routine tips"), false);
    assert.equal(isChildAbusePrompt("sex education for kids: how to talk to your children", "text"), false);
    assert.equal(isChildAbusePrompt("sexy sports car at sunset"), false);
  });
});

describe("admin assistant: proposed actions", () => {
  it("validates arguments and writes the summary from them", () => {
    const p = prepare("give_credits", { email: "Ada@Example.com", amount: 200, reason: "Bug report" });
    assert.ok(p);
    assert.equal(p.args.email, "ada@example.com");
    assert.match(p.summary, /200 credits to ada@example\.com/);
  });
  it("rejects unknown actions and out-of-range values", () => {
    assert.equal(prepare("delete_user", { email: "a@b.co" }), null);
    assert.equal(prepare("give_credits", { email: "a@b.co", amount: 1_000_000 }), null);
    assert.equal(prepare("suspend_user", { email: "not-an-email", reason: "x" }), null);
    assert.equal(prepare("__proto__", {}), null);
  });
});
