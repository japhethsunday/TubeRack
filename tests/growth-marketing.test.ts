import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { clean, cleanCode } from "@/src/server/growth/referrals";
import { campaignLink, renderCampaign, slug, EMPTY_CONTENT } from "@/src/server/growth/campaigns";
import { trackedUrl, verifyTracked, unsubscribeToken, verifyUnsubscribe } from "@/src/server/unsubscribe";
import { normalizePackage } from "@/src/server/growth/promo";

describe("growth & marketing", () => {
  afterEach(() => __resetEnvCache());
  const setup = () => {
    process.env.JWT_SECRET = "test-secret-for-growth-links-0123456789abcdef";
    process.env.APP_URL = "https://www.recktube.xyz";
    __resetEnvCache();
  };

  it("accepts only well-formed invite codes and cleans attribution tags", () => {
    assert.equal(cleanCode("abcd2345"), "ABCD2345");
    assert.equal(cleanCode("x'; drop"), "");
    assert.equal(cleanCode("O0I1ABCD"), "");
    assert.equal(clean("TikTok <script>"), "tiktokscript");
  });

  it("tags Recktube links with UTM and leaves other sites alone", () => {
    setup();
    const a = new URL(campaignLink("/content-creator", "launch"));
    assert.equal(a.origin, "https://www.recktube.xyz");
    assert.equal(a.searchParams.get("utm_campaign"), "launch");
    assert.equal(campaignLink("https://youtube.com/shorts/abc", "x"), "https://youtube.com/shorts/abc");
    assert.equal(new URL(campaignLink("javascript:alert(1)", "x")).pathname, "/dashboard");
    assert.equal(slug("Channel Creator Launch!"), "channel-creator-launch");
  });

  it("signs click redirects so they can't be used to send people elsewhere", () => {
    setup();
    const id = "11111111-1111-4111-8111-111111111111";
    const u = new URL(trackedUrl(id, "https://www.recktube.xyz/dashboard"));
    assert.ok(verifyTracked(id, "https://www.recktube.xyz/dashboard", u.searchParams.get("t") ?? ""));
    assert.equal(verifyTracked(id, "https://evil.example", u.searchParams.get("t") ?? ""), false);
  });

  it("keeps briefs and marketing unsubscribe tokens separate", () => {
    setup();
    const m = unsubscribeToken("a@b.co", "marketing");
    assert.ok(verifyUnsubscribe("a@b.co", m, "marketing"));
    assert.equal(verifyUnsubscribe("a@b.co", m, "briefs"), false);
  });

  it("renders campaigns with unsubscribe, tracking and no tracking in previews", () => {
    setup();
    const c = { name: "Launch", subject: "Hello", content: { ...EMPTY_CONTENT, heading: "New", body: "Para one.\n\nPara two." } };
    const live = renderCampaign(c, { email: "a@b.co", name: "Ada Lovelace" }, "11111111-1111-4111-8111-111111111111");
    assert.ok(live.html.includes("Hi Ada,"));
    assert.ok(live.html.includes("/api/v1/email/o/"));
    assert.ok(live.html.includes("Unsubscribe"));
    assert.ok(live.listUnsubscribe?.includes("k=m"));
    const preview = renderCampaign(c, { email: "a@b.co", name: "" }, null);
    assert.equal(preview.html.includes("/api/v1/email/o/"), false);
  });

  it("normalises promo packages and rejects empty ones", () => {
    const p = normalizePackage({ title: "T", scenes: [{ durationSec: 99, visual: "App", narration: "Hi", onScreenText: "Go" }], captions: [{ platform: "TikTok", hashtags: ["##Recktube", "a b"] }] });
    assert.equal(p.scenes[0].durationSec, 20);
    assert.deepEqual(p.captions[0].hashtags, ["#Recktube", "#ab"]);
    assert.throws(() => normalizePackage({ scenes: [] }), /no scenes/);
  });
});
