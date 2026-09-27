import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adminEmails, isAdmin } from "@/src/server/admin";

describe("admin access", () => {
  it("defaults to the owner only", () => {
    assert.deepEqual(adminEmails({ ADMIN_EMAILS: undefined } as never), ["japhethsunday5@gmail.com"]);
  });
  it("needs the listed email, a verified address and an active account", () => {
    const ok = { email: "JaphethSunday5@gmail.com", emailVerifiedAt: "2026-01-01", status: "active" };
    assert.equal(isAdmin(ok), true);
    assert.equal(isAdmin({ ...ok, emailVerifiedAt: null }), false);
    assert.equal(isAdmin({ ...ok, status: "suspended" }), false);
    assert.equal(isAdmin({ ...ok, email: "someone@else.com" }), false);
    assert.equal(isAdmin({ ...ok, email: "japhethsunday5@gmail.com.evil.com" }), false);
    assert.equal(isAdmin(null), false);
  });
});
