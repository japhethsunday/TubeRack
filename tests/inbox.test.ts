import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mailboxOf, parseAddress } from "@/src/server/inbox";
import { buildReply } from "@/src/server/admin-mail";

describe("admin inbox", () => {
  it("parses sender addresses", () => {
    assert.deepEqual(parseAddress('"Ada L" <Ada@Example.com>'), { name: "Ada L", address: "ada@example.com" });
    assert.deepEqual(parseAddress("bob@x.io"), { name: "", address: "bob@x.io" });
  });

  it("files mail under the address it was sent to", () => {
    assert.equal(mailboxOf({ to: ["abc@inbound.resend.app"], headers: { To: "security@recktube.xyz" } }), "security");
    assert.equal(mailboxOf({ to: ["support@recktube.xyz"] }), "support");
    assert.equal(mailboxOf({ to: ["x@y.z"] }), "support");
  });

  it("builds a threaded, branded reply that quotes the original", () => {
    const r = buildReply("security", "https://www.recktube.xyz", {
      subject: "Bug in login",
      message: "Thanks — fixed.",
      name: "Ada",
      quoted: "The login page <b>breaks</b>",
      quotedFrom: "ada@example.com",
      receivedAt: "2026-09-28T10:00:00Z",
    });
    assert.equal(r.subject, "Re: Bug in login");
    assert.ok(r.html.includes("Hi Ada,"));
    assert.ok(r.html.includes("&lt;b&gt;breaks&lt;/b&gt;"), "quoted text is escaped");
    assert.ok(r.text.includes("ada@example.com wrote:"));
    assert.equal(buildReply("support", "https://a.b", { subject: "RE: hi", message: "ok", quotedFrom: "a", receivedAt: "" }).subject, "RE: hi");
  });
});
