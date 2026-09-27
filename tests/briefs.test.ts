import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BRIEF_THEMES, breakoutAlert, isBreakout, nicheBrief, themeForDay } from "@/src/server/growth/briefs";
import type { TrendResult } from "@/src/lib/growth/trends";

const video = (id: string, vph: number, isNew = false) => ({
  videoId: id, title: `How I saved $1,000 in 30 days ${id}`, channelTitle: `Channel ${id}`, channelSubs: 12000,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, publishedAt: new Date().toISOString(), views: vph * 20, viewsPerHour: vph, isNew,
});
const result: TrendResult = { ranAt: new Date().toISOString(), videos: [video("a", 9000, true), video("b", 900), video("c", 700)], phrases: [{ phrase: "budget challenge", count: 4 }], medianViewsPerHour: 900 };
const APP = "https://www.recktube.xyz";

describe("niche briefs", () => {
  it("has ten distinct formats, each with a subject, logo and a working CTA", () => {
    assert.equal(BRIEF_THEMES.length, 10);
    assert.equal(new Set(BRIEF_THEMES.map((t) => t.id)).size, 10);
    for (const theme of BRIEF_THEMES) {
      const mail = nicheBrief([{ query: "personal finance", result }], APP, theme);
      assert.ok(mail, theme.id);
      assert.ok(mail.subject.length > 10 && mail.subject.length < 120, theme.id);
      assert.match(mail.html, /recktube-logo-120\.png/);
      assert.match(mail.html, /href="https:\/\/www\.recktube\.xyz\//);
      assert.ok(!mail.html.includes('href="/'), `${theme.id} has a relative link`);
      assert.match(mail.text, /personal finance/);
    }
  });
  it("rotates daily and returns nothing without videos", () => {
    assert.notEqual(themeForDay(new Date("2026-09-26")).id, themeForDay(new Date("2026-09-27")).id);
    assert.equal(nicheBrief([{ query: "x", result: { ...result, videos: [] } }], APP), null);
  });
  it("flags only new videos far ahead of the niche pace as breakouts", () => {
    assert.equal(isBreakout(result.videos[0], 900), true);
    assert.equal(isBreakout(result.videos[1], 900), false);
    const mail = breakoutAlert("personal finance", result.videos[0], 900, APP);
    assert.match(mail.subject, /Taking off in personal finance/);
    assert.match(mail.html, /10\.0× the niche pace/);
  });
});
