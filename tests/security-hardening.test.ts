import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey } from "@/src/server/rate-limit";

test("rate limits key on the platform-set client address, not a spoofable header", () => {
  const spoofed = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "9.9.9.9" } });
  assert.equal(clientKey(spoofed), "ip:9.9.9.9");
  const realIp = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.5.5.5" } });
  assert.equal(clientKey(realIp), "ip:5.5.5.5");
  assert.equal(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "7.7.7.7, 10.0.0.1" } })), "ip:7.7.7.7");
  assert.equal(clientKey(new Request("http://x")), "ip:unknown");
});

import { callerKey } from "@/src/server/rate-limit";

test("signed-in users sharing one IP get their own rate-limit bucket", () => {
  const a = new Request("http://x", { headers: { "x-vercel-forwarded-for": "1.1.1.1", cookie: "theme=dark; tr_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
  const b = new Request("http://x", { headers: { "x-vercel-forwarded-for": "1.1.1.1", cookie: "tr_session=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } });
  assert.notEqual(callerKey(a), callerKey(b));
  assert.match(callerKey(a), /^sess:[0-9a-f]{24}$/);
  assert.ok(!callerKey(a).includes("aaaa"), "the session token itself is never used as a key");
  assert.equal(callerKey(new Request("http://x", { headers: { "x-vercel-forwarded-for": "1.1.1.1" } })), "ip:1.1.1.1");
});
