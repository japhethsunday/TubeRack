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

describe("assistant email aliases", () => {
  it("send_email defaults to support@ and accepts our other addresses only", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    const base = { email: "ada@example.com", subject: "Hello there", message: "A short personal note." };
    assert.equal(prepare("send_email", base)?.args.from, "support");
    assert.match(prepare("send_email", { ...base, from: "founder" })!.summary, /founder@recktube\.xyz/);
    assert.equal(prepare("send_email", { ...base, from: "ceo" }), null);
  });
});

describe("assistant email everyone", () => {
  it("is one owner-only action, from founder@ to all users by default", async () => {
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    const { roleAllows } = await import("@/src/lib/admin-roles");
    const p = prepare("email_everyone", { subject: "A note from our founder", message: "Thank you for building with Recktube." });
    assert.equal(p?.args.from, "founder");
    assert.equal(p?.args.audience, "all_users");
    assert.match(p!.summary, /founder@recktube\.xyz/);
    assert.equal(prepare("email_everyone", { subject: "Hi there", message: "Thank you for everything.", audience: "all_users_even_opted_out" }), null);
    for (const r of ["support", "finance", "operations"] as const) assert.equal(roleAllows(r, ACTIONS.email_everyone.permission), false);
  });
});

describe("assistant navigation and credit removal", () => {
  it("only opens our own admin pages", async () => {
    const { safeAdminPath } = await import("@/src/server/admin-agent/agent");
    assert.equal(safeAdminPath("/admin/inbox"), "/admin/inbox");
    assert.equal(safeAdminPath("/admin/users?q=ada@example.com"), "/admin/users?q=ada%40example.com");
    assert.equal(safeAdminPath("https://evil.example"), null);
    assert.equal(safeAdminPath("//evil.example"), null);
    assert.equal(safeAdminPath("/admin/../dashboard"), null);
    assert.equal(safeAdminPath("/admin/nope"), null);
  });
  it("remove_credits needs a positive amount", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    assert.match(prepare("remove_credits", { email: "ada@example.com", amount: 50 })!.summary, /Remove 50 credits/);
    assert.equal(prepare("remove_credits", { email: "ada@example.com", amount: -5 }), null);
  });
});

describe("boss mode", () => {
  it("is only for the first owner address, verified and active", async () => {
    const { isBoss } = await import("@/src/server/admin-agent/boss");
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "boss@example.com, second@example.com";
    try {
      const ok = { email: "Boss@Example.com", emailVerifiedAt: "2026-01-01", status: "active" };
      assert.equal(isBoss(ok), true);
      assert.equal(isBoss({ ...ok, email: "second@example.com" }), false);
      assert.equal(isBoss({ ...ok, emailVerifiedAt: null }), false);
      assert.equal(isBoss({ ...ok, status: "suspended" }), false);
      assert.equal(isBoss(null), false);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });
});

describe("assistant support replies", () => {
  it("reply_support needs a real chat id and a real message", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    const id = "3f2b6c1e-8a4d-4c2e-9b1a-1234567890ab";
    const p = prepare("reply_support", { conversationId: id, message: "Thanks for the details, here is how to fix it." });
    assert.equal(p?.args.resolve, false);
    assert.match(p!.summary, /Reply in support chat 3f2b6c1e/);
    assert.equal(prepare("reply_support", { conversationId: "../etc", message: "Thanks for the details, here is how." }), null);
    assert.equal(prepare("reply_support", { conversationId: id, message: "ok" }), null);
  });
});

describe("assistant promo videos", () => {
  it("write_promo_videos defaults to 2 and caps at 5", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    assert.equal(prepare("write_promo_videos", {})?.args.count, 2);
    assert.match(prepare("write_promo_videos", { count: 3, feature: "video-studio" })!.summary, /Write 3 new promo videos for Recktube about Video Studio/);
    assert.equal(prepare("write_promo_videos", { count: 9 }), null);
    assert.equal(prepare("write_promo_videos", { feature: "hack" }), null);
  });
});
