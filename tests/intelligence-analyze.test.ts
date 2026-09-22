import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeIdea, suggestAngles, IDEA_METHODOLOGY } from "@/src/lib/intelligence/idea";
import { analyzeTitle, generateTitleDirections } from "@/src/lib/intelligence/titles";
import { detectWeakOpenings, hookFrameworks, classifyHook } from "@/src/lib/intelligence/hooks";
import { analyzeRetention, RETENTION_METHODOLOGY } from "@/src/lib/intelligence/retention";

describe("idea analysis", () => {
  it("rates dimensions from input coverage with strengths and risks", () => {
    const { dimensions, summary } = analyzeIdea({
      idea: "Why payoff-first openings hold past thirty seconds",
      audience: "New creators under 10k subs",
      problem: "They post for months with no traction and burn out",
      differentiation: "Tested across 30 of my own videos with retention graphs",
    });
    assert.equal(dimensions.length, 10);
    for (const d of dimensions) {
      assert.ok(["strong", "developing", "gap"].includes(d.rating), d.dimension);
      assert.ok(d.strength.length > 0 && d.risk.length > 0 && d.opportunity.length > 0 && d.recommendation.length > 0, d.dimension);
    }
    const ratings = Object.fromEntries(dimensions.map((d) => [d.dimension, d.rating]));
    assert.equal(ratings["Audience relevance"], "strong");
    assert.equal(ratings["Differentiation"], "strong");
    assert.ok(summary.includes("10 dimensions"));
    assert.ok(IDEA_METHODOLOGY.includes("no AI provider"));
  });

  it("marks missing input as gaps, not guesses", () => {
    const { dimensions } = analyzeIdea({ idea: "hooks" });
    const ratings = Object.fromEntries(dimensions.map((d) => [d.dimension, d.rating]));
    assert.equal(ratings["Audience relevance"], "gap");
    assert.equal(ratings["Problem strength"], "gap");
    assert.equal(ratings["Differentiation"], "gap");
  });

  it("suggests twelve fixed angles with the topic slotted in", () => {
    const angles = suggestAngles("retention graphs");
    assert.equal(angles.length, 12);
    const cats = angles.map((a) => a.category);
    assert.ok(cats.includes("Tutorial") && cats.includes("Contrarian") && cats.includes("Case study"));
    for (const a of angles) {
      assert.ok(a.hookDirection.includes("retention graphs"), a.category);
      assert.ok(a.risk.length > 0, a.category);
    }
  });
});

describe("title intelligence", () => {
  it("flags shouting, overpromising, and emptiness with reasons", () => {
    const loud = analyzeTitle("AMAZING SHOCKING SECRET!!! 100% GUARANTEED");
    const byCheck = Object.fromEntries(loud.checks.map((c) => [c.check, c.verdict]));
    assert.equal(byCheck["Capitalization"], "flag");
    assert.equal(byCheck["Misleading language"], "flag");
    assert.equal(byCheck["Punctuation"], "flag");
    const clean = analyzeTitle("Fix your hook in 8 seconds");
    assert.ok(clean.checks.every((c) => c.verdict !== "flag"));
    const empty = analyzeTitle("   ");
    assert.ok(empty.summary.includes("Enter a title"));
  });

  it("generates eight directions with two variants each", () => {
    const dirs = generateTitleDirections("hooks", "new creators");
    assert.equal(dirs.length, 8);
    for (const d of dirs) {
      assert.equal(d.variants.length, 2);
      assert.ok(d.variants.every((v) => v.toLowerCase().includes("hook")), d.category);
    }
  });
});

describe("hook intelligence", () => {
  it("detects greeting filler, meta announcements, and apologies", () => {
    const hits = detectWeakOpenings("Hey guys welcome back to the channel, in this video I'm going to show you hooks");
    assert.ok(hits.some((h) => h.label === "Greeting filler"));
    assert.ok(hits.some((h) => h.label === "Meta announcement"));
    assert.ok(hits.every((h) => h.suggestion.length > 0));
    assert.deepEqual(detectWeakOpenings("The payoff first, then the proof."), []);
    assert.deepEqual(detectWeakOpenings("   "), []);
  });

  it("classifies drafts and frameworks by transparent rules", () => {
    assert.equal(classifyHook("Why does this fail for beginners?"), "Question");
    assert.equal(classifyHook("Stop editing like it's 2019"), "Contrarian");
    assert.equal(classifyHook(""), "Empty");
    const frameworks = hookFrameworks("hooks");
    assert.equal(frameworks.length, 9);
    assert.ok(frameworks.every((f) => f.starter.includes("hooks") && f.followWith.length > 0));
  });
});

describe("retention review", () => {
  it("handles empty outlines and flags real structural risks", () => {
    const empty = analyzeRetention([]);
    assert.equal(empty.estimateMinutes, 0);
    const risky = analyzeRetention([
      { heading: "Intro", body: "welcome back guys ".repeat(60) },
      { heading: "More intro", body: "welcome back guys ".repeat(60) },
      { heading: "Ending", body: "thanks for watching" },
    ]);
    assert.ok(risky.flags.some((f) => f.area === "Opening"), "opening weight");
    assert.ok(risky.flags.some((f) => f.area.includes("Sections")), "repetition");
    assert.ok(risky.flags.some((f) => f.area === "Payoff"), "missing payoff");
    assert.ok(risky.estimateMinutes >= 1);
    assert.ok(risky.summary.includes("Risks are to inspect"));
    assert.ok(RETENTION_METHODOLOGY.includes("no watch data"));
  });
});
