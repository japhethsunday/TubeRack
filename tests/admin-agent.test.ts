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
    assert.match(prepare("write_promo_videos", { count: 3, feature: "video-studio" })!.summary, /Write 3 new how-to videos for the Recktube channel about Video Studio/);
    assert.match(prepare("write_promo_videos", { count: 1, kind: "ad" })!.summary, /Write 1 new ad video/);
    assert.equal(prepare("write_promo_videos", { kind: "promo" }), null);
    assert.equal(prepare("write_promo_videos", { count: 9 }), null);
    assert.equal(prepare("write_promo_videos", { feature: "hack" }), null);
  });
});

describe("assistant hands-free posting", () => {
  it("make_and_post_videos defaults to YouTube now and is limited to 1-7 videos", async () => {
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    const p = prepare("make_and_post_videos", {});
    assert.equal(p?.args.count, 2);
    assert.match(p!.summary, /schedule them on YouTube, hands-free: the first goes live now, the others one per day at 5 PM/);
    assert.equal(prepare("make_and_post_videos", { count: 8 }), null);
    assert.equal(ACTIONS.make_and_post_videos.permission, "promo.write");
  });
  it("schedules YouTube and TikTok at a time of day", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    const p = prepare("make_and_post_videos", { count: 5, platforms: ["youtube", "tiktok"], when: "afternoon" });
    assert.match(p!.summary, /on YouTube and TikTok, hands-free: one per day at 2 PM, starting today/);
    assert.equal(prepare("make_and_post_videos", { platforms: ["instagram"] }), null);
    assert.equal(prepare("make_and_post_videos", { when: "midnight" }), null);
  });
});

describe("assistant promo clean-up and channel", () => {
  it("delete_promo_videos defaults to failed ones and is gated", async () => {
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    assert.equal(prepare("delete_promo_videos", {})?.args.which, "failed");
    assert.match(prepare("delete_promo_videos", { which: "unposted" })!.summary, /Videos already on YouTube stay on YouTube/);
    assert.equal(prepare("delete_promo_videos", { which: "youtube" }), null);
    assert.equal(ACTIONS.delete_promo_videos.permission, "promo.delete");
  });
  it("youtube_channel look-up exists with a sane default window", async () => {
    const { TOOLS } = await import("@/src/server/admin-agent/tools");
    assert.equal(TOOLS.youtube_channel.args.parse({}).days, 28);
    assert.equal(TOOLS.youtube_channel.args.safeParse({ days: 400 }).success, false);
  });
});

describe("assistant email series", () => {
  it("schedules 1-7 emails, one a day from tomorrow at 07:00 UTC by default", async () => {
    const { prepare, seriesDate } = await import("@/src/server/admin-agent/actions");
    const emails = [1, 2, 3, 4, 5].map((n) => ({ subject: `Tip number ${n}`, message: `A genuinely useful creator tip, number ${n}.` }));
    const p = prepare("schedule_email_series", { emails });
    assert.equal(p?.args.startInDays, 1);
    assert.equal(p?.args.everyDays, 1);
    assert.equal(p?.args.from, "founder");
    assert.match(p!.summary, /Schedule 5 emails from founder@recktube\.xyz/);
    assert.equal(prepare("schedule_email_series", { emails: [...emails, ...emails] }), null);
    const d = seriesDate(2, new Date(Date.UTC(2026, 8, 30, 21, 0)));
    assert.equal(d.toISOString(), "2026-10-02T07:00:00.000Z");
  });
});

describe("bonus codes and choices", () => {
  it("create_bonus_code needs a type and describes it", async () => {
    const { prepare } = await import("@/src/server/admin-agent/actions");
    assert.equal(prepare("create_bonus_code", { credits: 50 }), null);
    const g = prepare("create_bonus_code", { kind: "group", credits: 50, maxUses: 100, days: 30 });
    assert.match(g!.summary, /group code for up to 100 people.*50 credits each.*valid 30 days/);
    const i = prepare("create_bonus_code", { kind: "individual", credits: 200, email: "ada@example.com" });
    assert.match(i!.summary, /individual code for ada@example.com only/);
  });
  it("delete_bonus_code exists and is gated", async () => {
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    assert.match(prepare("delete_bonus_code", { code: "creator50" })!.summary, /Delete bonus code CREATOR50/);
    assert.equal(ACTIONS.delete_bonus_code.permission, "credits.change");
  });
});

describe("scheduling look-ups and single cancel", () => {
  it("upcoming_posts replaces scheduled_posts and cancel_scheduled_post is gated", async () => {
    const { TOOLS } = await import("@/src/server/admin-agent/tools");
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    assert.ok("upcoming_posts" in TOOLS && "bonus_codes" in TOOLS);
    assert.match(prepare("cancel_scheduled_post", { id: "11111111-2222-3333-4444-555555555555", title: "Money tips" })!.summary, /Cancel the scheduled TikTok post “Money tips”/);
    assert.equal(ACTIONS.cancel_scheduled_post.permission, "promo.write");
  });
});

describe("support assistant choices", () => {
  it("keeps up to 5 short choices and drops them on hand-over", async () => {
    const { parseTurn } = await import("@/src/server/support/assistant");
    const t = parseTurn(JSON.stringify({ reply: "What's happening?", action: "answer", category: "other", subject: "x", choices: ["My export has no sound", "The voice sounds robotic", 3, "", "a", "b", "c"] }));
    assert.deepEqual(t.choices, ["My export has no sound", "The voice sounds robotic", "a", "b", "c"]);
    const h = parseTurn(JSON.stringify({ reply: "Passing you to the team.", action: "handoff", category: "other", subject: "x", choices: ["Yes"] }));
    assert.deepEqual(h.choices, []);
  });
});

describe("clearing the error alert", () => {
  it("dismiss_failures is a confirm-only action gated to usage viewers", async () => {
    const { prepare, ACTIONS } = await import("@/src/server/admin-agent/actions");
    assert.match(prepare("dismiss_failures", {})!.summary, /clear the red error alert/);
    assert.equal(ACTIONS.dismiss_failures.permission, "usage.view");
  });
});

describe("video kinds", () => {
  it("how-to by default, ads only when asked", async () => {
    const { styleFor, TEACHING_STYLES } = await import("@/src/server/growth/promo");
    for (let i = 0; i < 8; i++) assert.ok(TEACHING_STYLES.has(styleFor(i, 1_000_000, "how-to")));
    for (let i = 0; i < 8; i++) assert.ok(!TEACHING_STYLES.has(styleFor(i, 1_000_000, "ad")));
  });
});
