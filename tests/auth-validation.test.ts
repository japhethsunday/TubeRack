import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loginSchema,
  signupSchema,
  forgotSchema,
  resetSchema,
  changePasswordSchema,
  profileSchema,
} from "@/src/lib/auth/validation";
import { passwordScore } from "@/src/lib/auth/password";

const GOOD_PASSWORD = "Correct-Horse-99";

describe("auth validation", () => {
  it("accepts a complete valid signup", () => {
    const r = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@studio.com",
      password: GOOD_PASSWORD,
      confirm: GOOD_PASSWORD,
      terms: true,
    });
    assert.equal(r.success, true);
  });

  it("rejects bad email, weak password, mismatch, and missing terms", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "not-an-email",
      password: "short",
      confirm: "different",
      terms: false,
    });
    assert.equal(r.success, false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      assert.ok(paths.includes("email"));
      assert.ok(paths.includes("password") || paths.includes("confirm"));
    }
  });

  it("flags confirmation mismatch on the confirm field", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "ada@studio.com",
      password: GOOD_PASSWORD,
      confirm: GOOD_PASSWORD + "x",
      terms: true,
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.ok(r.error.issues.some((i) => i.path.join(".") === "confirm"));
    }
  });

  it("requires both login fields", () => {
    assert.equal(loginSchema.safeParse({ email: "", password: "" }).success, false);
    assert.equal(
      loginSchema.safeParse({ email: "ada@studio.com", password: "x" }).success,
      true,
    );
  });

  it("validates forgot, reset, change, and profile inputs", () => {
    assert.equal(forgotSchema.safeParse({ email: "bad" }).success, false);
    assert.equal(forgotSchema.safeParse({ email: "ada@studio.com" }).success, true);
    assert.equal(
      resetSchema.safeParse({ token: "", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD }).success,
      false,
    );
    assert.equal(
      changePasswordSchema.safeParse({ current: "", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD }).success,
      false,
    );
    assert.equal(profileSchema.safeParse({ name: "" }).success, false);
    assert.equal(
      profileSchema.safeParse({ name: "Ada", username: "BAD NAME!" }).success,
      false,
    );
    assert.equal(
      profileSchema.safeParse({ name: "Ada", username: "studio-ada" }).success,
      true,
    );
  });
});

describe("password strength", () => {
  it("tiers from too weak to strong", () => {
    assert.equal(passwordScore("abc").label, "Too weak");
    assert.equal(passwordScore("abcdefgh").score >= 1, true);
    assert.equal(passwordScore("Abcdefgh").label, "Weak");
    assert.equal(passwordScore("Abcdefgh1").label, "Fair");
    assert.equal(passwordScore(GOOD_PASSWORD).label, "Strong");
  });

  it("rewards length over complexity", () => {
    assert.ok(passwordScore("correct horse battery staple").score >= passwordScore("A1!").score);
  });
});
