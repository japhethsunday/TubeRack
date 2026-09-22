import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeReturnTo,
  loginUrl,
  ACCOUNT_STATES,
  DEFAULT_RETURN_TO,
} from "@/src/lib/auth/session";
import { AUTH_ERRORS, authError, FORGOT_SUBMITTED_MESSAGE } from "@/src/lib/auth/errors";
import { AuthNotIntegratedError, SESSION_ENFORCEMENT, boundaryMessage } from "@/src/lib/auth/boundary";

describe("session helpers", () => {
  it("keeps safe same-origin paths including query and hash", () => {
    assert.equal(sanitizeReturnTo("/projects/preview?stage=video"), "/projects/preview?stage=video");
    assert.equal(sanitizeReturnTo("/settings?tab=security"), "/settings?tab=security");
  });

  it("rejects open redirects and garbage", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil",
      "/a\\b",
      "javascript:alert(1)",
      "/",
      "",
      null,
      undefined,
      "/a\n/b",
    ]) {
      assert.equal(sanitizeReturnTo(bad), DEFAULT_RETURN_TO, String(bad));
    }
  });

  it("builds login urls that preserve destination", () => {
    assert.equal(loginUrl(), "/login");
    assert.equal(loginUrl("/settings"), "/login?returnTo=%2Fsettings");
    assert.equal(loginUrl("https://evil.com"), "/login");
  });

  it("documents every account state with a valid tone", () => {
    const states = Object.keys(ACCOUNT_STATES);
    assert.equal(states.length, 8);
    for (const s of states) {
      const meta = ACCOUNT_STATES[s as keyof typeof ACCOUNT_STATES];
      assert.ok(meta.title.length > 0 && meta.body.length > 0, s);
      assert.ok(["info", "warn", "bad", "ok"].includes(meta.tone), s);
    }
  });
});

describe("auth errors", () => {
  it("maps every code to an actionable, relative-href message", () => {
    const codes = Object.keys(AUTH_ERRORS);
    assert.equal(codes.length, 13);
    for (const code of codes) {
      const content = authError(code as keyof typeof AUTH_ERRORS);
      assert.ok(content.title.length > 0, code);
      assert.ok(content.body.length > 0, code);
      assert.ok(content.actionHref.startsWith("/"), code);
      assert.ok(
        !/bearer|jwt|secret|token=[A-Za-z0-9]/i.test(`${content.title} ${content.body}`),
        `${code} leaks sensitive detail`,
      );
    }
  });

  it("keeps forgot-password responses account-agnostic", () => {
    assert.ok(FORGOT_SUBMITTED_MESSAGE.startsWith("If an account exists"));
  });
});

describe("auth boundary", () => {
  it("throws an explicit integration error, never a fake session", () => {
    const err = new AuthNotIntegratedError("Sign-in");
    assert.equal(err.code, "AUTH_NOT_INTEGRATED");
    assert.ok(err.message.includes("Phase 11"));
    assert.ok(err.message.includes("nothing was sent or stored"));
    assert.ok(boundaryMessage("Logout").includes("Logout"));
  });

  it("declares sessions unenforced until Phase 11", () => {
    assert.equal(SESSION_ENFORCEMENT.enforced, false);
    assert.equal(SESSION_ENFORCEMENT.phase, "Phase 11");
  });
});
