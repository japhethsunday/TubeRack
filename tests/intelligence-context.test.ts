import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyDNA, parseDNA, dnaCompleteness, missingDnaFields, dnaFields } from "@/src/lib/intelligence/dna";
import { assembleContext } from "@/src/lib/intelligence/context";
import {
  emptyAudienceProfile,
  audienceCompleteness,
  missingAudienceFields,
  emptyStrategyBrief,
  strategyCompleteness,
  buildProductionBrief,
} from "@/src/lib/intelligence/profiles";
import { findGaps } from "@/src/lib/intelligence/gaps";

describe("channel DNA", () => {
  it("tracks coverage honestly and validates shape", () => {
    const dna = emptyDNA("ch_1");
    assert.equal(dnaCompleteness(dna), 0);
    assert.equal(missingDnaFields(dna).length, dnaFields().length);
    const filled = { ...dna, tone: "Direct", audience: "New creators" };
    assert.ok(dnaCompleteness(filled) > 0);
    assert.ok(!missingDnaFields(filled).includes("Tone"));
    assert.throws(() => parseDNA({ channelId: 42 }), /Invalid brand DNA/);
    assert.deepEqual(parseDNA({ ...dna }).channelId, "ch_1");
  });
});

describe("context assembly", () => {
  it("declares every part, completeness, and gaps", () => {
    const full = assembleContext("idea-analysis", {
      idea: "Hooks",
      audience: "Creators",
      channelName: "Studio",
      projectName: "Ep 1",
      projectTopic: "Hooks",
      projectGoal: "100k",
      dna: { ...emptyDNA("ch_1"), tone: "Direct" },
      research: [{ id: "r1", title: "Notes", summary: "Key points", facts: [] }],
      instruction: "Be blunt.",
    });
    assert.equal(full.task, "idea-analysis");
    assert.ok(full.completeness > 50);
    assert.ok(full.payload["Idea"] === "Hooks");
    assert.ok(full.payload["Research"].includes("Notes"));

    const empty = assembleContext("idea-analysis", {});
    assert.ok(empty.completeness < 30);
    assert.ok(empty.missing.includes("Idea"));
    assert.ok(empty.missing.includes("Channel DNA"));
  });
});

describe("audience + strategy profiles", () => {
  it("measures completeness and names missing fields", () => {
    const audience = emptyAudienceProfile();
    assert.equal(audienceCompleteness(audience), 0);
    audience.primary = "New creators";
    audience.problem = "No traction";
    assert.ok(audienceCompleteness(audience) > 0);
    assert.ok(missingAudienceFields(audience).includes("Desired outcome"));

    const strategy = emptyStrategyBrief();
    assert.equal(strategyCompleteness(strategy), 0);
    strategy.promise = "Fix hooks fast";
    assert.ok(strategyCompleteness(strategy) > 0);

    const brief = buildProductionBrief({
      idea: "Hooks",
      audience,
      strategy,
      dnaSummary: "Tone: Direct",
    });
    assert.ok(brief.includes("# Production brief"));
    assert.ok(brief.includes("New creators"));
    assert.ok(brief.includes("Fix hooks fast"));
    assert.ok(brief.includes("Phase 11"));
  });
});

describe("content gaps", () => {
  it("prompts from real catalog and references without inventing data", () => {
    const empty = findGaps({ topic: "", catalog: [], references: [] });
    assert.ok(empty.gaps.some((g) => g.kind === "fresh-perspective"));
    assert.ok(empty.summary.includes("Nothing to compare"));

    const withData = findGaps({
      topic: "Why do hooks fail? I need a tutorial angle.",
      catalog: [{ name: "My story", topic: "How I burned out" }],
      references: [{ title: "Beginner hooks 101", angle: "Beginner guide", depth: "shallow" }],
    });
    assert.ok(withData.gaps.some((g) => g.kind === "unanswered"), "question prompt");
    assert.ok(withData.gaps.some((g) => g.kind === "uncovered-angle"), "angle coverage");
    assert.ok(withData.gaps.some((g) => g.kind === "weak-beginner"), "shallow beginner");
    assert.ok(!JSON.stringify(withData).match(/views|subscribers|CTR|ranking/i), "no fabricated metrics");
  });
});
