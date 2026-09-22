import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildConcepts,
  composeThumbnail,
  reviewThumbnail,
  reviewPairing,
  contrastRatio,
  solidBase,
  THUMBNAIL_METHOD,
} from "@/src/lib/package/thumbnails";
import {
  extractKeywords,
  formatTimestamp,
  parseTimestamp,
  chaptersFromSegments,
  chaptersToText,
  buildDescription,
  reviewSeo,
} from "@/src/lib/package/seo";
import {
  PLATFORMS,
  platformById,
  ADAPTATION_RULES,
  findMoments,
  adaptMoment,
  checkConsistency,
} from "@/src/lib/package/platforms";
import type { PlatformId } from "@/src/lib/package/types";
import { emptyPackageBundle, parsePackageBundle } from "@/src/lib/package/storage";

describe("thumbnail concepts", () => {
  it("builds six editable archetypes from project context", () => {
    const concepts = buildConcepts({
      topic: "Hooks",
      title: "Fix your hook",
      audience: "Creators",
      angle: "Tutorial",
      tone: "Direct",
      visualStyle: "Cinematic",
      avoidStyles: "Clutter",
    });
    assert.equal(concepts.length, 6);
    assert.ok(concepts.some((c) => c.name === "Face + outcome"));
    assert.ok(concepts.every((c) => c.visual.includes("Hooks")));
    assert.ok(concepts.every((c) => c.brandNotes.includes("Direct")));
    assert.ok(THUMBNAIL_METHOD.includes("no AI provider"));
  });

  it("composes standalone SVG and reviews quality honestly", () => {
    const base = solidBase("#111111", "#333333");
    const svg = composeThumbnail(base, [
      { id: "o1", text: "FIX HOOKS", x: 8, y: 60, size: 120, color: "#ffffff", weight: 800, align: "left" },
    ]);
    assert.ok(svg.startsWith("<svg") && svg.includes("FIX HOOKS") && svg.includes('width="1280"'));
    const evil = composeThumbnail(base, [
      { id: "o1", text: "<script>alert(1)</script>", x: 8, y: 60, size: 120, color: "#ffffff", weight: 800, align: "left" },
    ]);
    assert.ok(!evil.includes("<script>") && evil.includes("&lt;script&gt;"));

    const good = reviewThumbnail([
      { id: "o1", text: "FIX HOOKS", x: 8, y: 60, size: 120, color: "#ffffff", weight: 800, align: "left" },
    ]);
    assert.ok(good.flags.every((f) => f.level === "pass" || f.check === "Overall" || f.check === "Hierarchy"));
    assert.ok(good.summary.includes("never a click prediction"));

    const bad = reviewThumbnail([
      { id: "o1", text: "tiny", x: 8, y: 60, size: 20, color: "#222222", weight: 500, align: "left" },
      { id: "o2", text: "more tiny words here today forever", x: 8, y: 70, size: 20, color: "#222222", weight: 500, align: "left" },
      { id: "o3", text: "a", x: 8, y: 80, size: 20, color: "#222222", weight: 500, align: "left" },
      { id: "o4", text: "b", x: 8, y: 85, size: 20, color: "#222222", weight: 500, align: "left" },
      { id: "o5", text: "c", x: 8, y: 90, size: 20, color: "#222222", weight: 500, align: "left" },
    ]);
    assert.ok(bad.flags.some((f) => f.level === "issue" && f.check === "Readability"));
    assert.ok(bad.flags.some((f) => f.check === "Clutter"));
    assert.ok(contrastRatio("#ffffff", "#000000") > 15);
    assert.ok(contrastRatio("#777777", "#888888") < 3);
  });

  it("pairs titles and thumbnails without CTR claims", () => {
    const repeat = reviewPairing("Fix your hook fast today", "Fix your hook fast");
    assert.ok(repeat.some((p) => p.verdict === "repeat"));
    const complement = reviewPairing("Fix your hook fast today", "Payoff");
    assert.ok(complement.some((p) => p.verdict === "drift" || p.verdict === "complement"));
    const empty = reviewPairing("Fix your hook?", "");
    assert.ok(empty.some((p) => p.note.includes("retention pays the price")));
    assert.ok(!JSON.stringify(repeat).match(/CTR|click-through|guarantee/i));
  });
});

describe("seo workspace", () => {
  it("extracts real keyword frequencies and formats chapters", () => {
    const { keywords, totalWords } = extractKeywords("Hooks matter. Hooks win. Retention follows hooks daily.");
    assert.ok(totalWords > 0);
    const hooks = keywords.find((k) => k.term === "hooks");
    assert.ok(hooks && hooks.count === 3);
    assert.ok(!keywords.some((k) => k.term === "the"));

    assert.equal(formatTimestamp(75), "1:15");
    assert.equal(formatTimestamp(3661), "1:01:01");
    assert.equal(parseTimestamp("1:15"), 75);
    assert.equal(parseTimestamp("9:99"), null);
    assert.equal(parseTimestamp("nope"), null);

    const chapters = chaptersFromSegments([
      { title: "Intro", startSec: 4 },
      { title: "Main", startSec: 75 },
    ]);
    assert.deepEqual(chapters[0], { timeSec: 0, title: "Intro" });
    assert.ok(chaptersToText(chapters).includes("0:00 Intro"));
  });

  it("assembles descriptions with visible placeholders only", () => {
    const desc = buildDescription({
      promise: "Fix hooks fast.",
      topic: "Hooks",
      takeaway: "Payoff first.",
      cta: "Subscribe.",
      chapters: [{ timeSec: 0, title: "Intro" }],
      hashtags: ["hooks", "#growth"],
      links: [{ label: "Template", url: "https://example.com/t" }],
    });
    assert.ok(desc.includes("Fix hooks fast."));
    assert.ok(desc.includes("0:00 Intro"));
    assert.ok(desc.includes("https://example.com/t"));
    assert.ok(desc.includes("[Sponsor disclosure"));
    assert.ok(desc.includes("#hooks #growth"));
  });

  it("reviews structure without scores", () => {
    const descBlock =
      "Learn payoff-first openings with clear examples and steady pacing across every lesson you publish this quarter for steady growth. " +
      "Fix your hook fast with one concrete change today and measure retention tomorrow morning. " +
      "Study graphs, restate stakes early, close loops, tighten edits, practice delivery, publish consistently, review analytics weekly, iterate formats, and keep promises specific.";
    const good = reviewSeo({
      topic: "Payoff-first hooks",
      intent: "Learn fast",
      title: "Fix your hook fast",
      description: `${descBlock} ${descBlock} ${descBlock}`,
      keywords: ["hook"],
      tags: ["hooks"],
      chapters: [{ timeSec: 0, title: "Intro" }],
      durationSec: 120,
    });
    assert.ok(good.checks.every((c) => c.verdict === "pass"));
    assert.ok(good.summary.includes("Complete"));

    const bad = reviewSeo({
      topic: "x",
      intent: "",
      title: "",
      description: "hook hook hook hook hooks everywhere hook hook",
      keywords: [],
      tags: [],
      chapters: [{ timeSec: 30, title: "Late" }],
      durationSec: 120,
    });
    assert.ok(bad.checks.some((c) => c.verdict === "issue"));
    assert.ok(!JSON.stringify(bad).match(/score|%|percent/i));
  });
});

describe("platforms + repurposing", () => {
  it("defines seven platforms with bounded fields", () => {
    assert.equal(PLATFORMS.length, 7);
    for (const p of PLATFORMS) {
      assert.ok(p.fields.length > 0 && p.hashtagLimit > 0, p.id);
    }
    assert.equal(platformById("x").captionTarget.includes("280"), true);
    assert.equal(platformById("nope" as PlatformId).id, "youtube");
    assert.equal(ADAPTATION_RULES.tiktok.maxChars, 150);
  });

  it("finds moments from hooks, sections, claims, and questions", () => {
    const moments = findMoments({
      hooks: [{ id: "h1", text: "Fix your hook fast" }],
      sections: [
        { id: "s1", type: "climax", heading: "Insight", text: "The payoff must land before thirty seconds pass viewers by." },
        { id: "s2", type: "main-point", heading: "Q", text: "Why do hooks fail for beginners?" },
      ],
      claims: [{ text: "73% of viewers leave early", kind: "statistic" }],
    });
    assert.ok(moments.some((m) => m.kind === "hook"));
    assert.ok(moments.some((m) => m.kind === "insight"));
    assert.ok(moments.some((m) => m.kind === "fact"));
    assert.ok(moments.some((m) => m.kind === "question"));
    assert.ok(moments.length <= 10);
  });

  it("adapts deterministically per platform without inventing facts", () => {
    const moment = { id: "m1", source: "Hook", text: "Fix your hook in eight seconds with a payoff-first opening today", kind: "hook" as const };
    const x = adaptMoment(moment, "x-post", "x", { cta: "", hashtags: ["hooks"] });
    assert.ok(x.body.length <= 280);
    assert.ok(x.body.includes("#hooks"));
    const short = adaptMoment(moment, "tiktok-script", "tiktok", { cta: "", hashtags: [] });
    assert.ok(short.body.includes("HOOK"));
    const carousel = adaptMoment(moment, "carousel", "reels", { cta: "", hashtags: [] });
    assert.ok(carousel.body.includes("Slide 1"));
  });

  it("flags unsupported figures, avoid-words, and new promises", () => {
    const source = "The hook runs eight seconds. Avoid hype.";
    const clean = checkConsistency({ hook: "Hook", body: "Eight seconds of payoff.", cta: "Subscribe" }, source, ["hype"]);
    assert.deepEqual(clean, []);
    const bad = checkConsistency(
      { hook: "Hook", body: "Get 10x views guaranteed overnight with 73% lift.", cta: "" },
      source,
      [],
    );
    assert.ok(bad.some((f) => f.level === "issue" && f.note.includes("Unsupported figure")));
    assert.ok(bad.some((f) => f.note.includes("promise")));
    assert.deepEqual(checkConsistency({ hook: "a", body: "b", cta: "c" }, "a b c", []), []);
  });
});

describe("package storage", () => {
  it("round-trips bundles and rejects garbage", () => {
    const bundle = emptyPackageBundle();
    assert.deepEqual(parsePackageBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parsePackageBundle({}), /package file/);
    assert.throws(() => parsePackageBundle({ version: 1, concepts: [{ id: 1 }], variants: [], titles: [], seo: [], packs: [], items: [] }), /package file/);
  });
});
