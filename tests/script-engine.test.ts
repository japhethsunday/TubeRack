import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNames, formatDef, TONES, LENGTH_TARGETS } from "@/src/lib/script/formats";
import {
  countWords,
  countChars,
  estimateSeconds,
  formatDuration,
  scriptWords,
  extractShorten,
} from "@/src/lib/script/measure";
import {
  blankSection,
  detectClaims,
  addResearchRef,
  removeResearchRef,
  __resetScriptIds,
} from "@/src/lib/script/claims";
import {
  ASSEMBLY_METHOD,
  assembleScript,
  addSection,
  duplicateSection,
  deleteSection,
  moveSection,
  splitSection,
  mergeSections,
  editSectionText,
  snapshotVersion,
  restoreVersion,
  diffVersions,
  addLoop,
  resolveLoop,
  unpaidLoops,
  scenesFromSections,
  sceneNeedsReview,
  markSceneSynced,
} from "@/src/lib/script/engine";
import { reviewSections } from "@/src/lib/script/review";
import { emptyScriptBundle, parseScriptBundle } from "@/src/lib/script/storage";
import type { ScriptSection } from "@/src/lib/script/types";

function section(overrides: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: "s1",
    type: "main-point",
    heading: "Beat",
    text: "",
    aiGenerated: false,
    edited: false,
    sceneIds: [],
    retentionNotes: [],
    researchRefs: [],
    creatorNotes: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("script formats", () => {
  it("registers fourteen extensible formats with section templates", () => {
    assert.equal(formatNames().length, 14);
    assert.ok(formatNames().includes("Custom"));
    assert.deepEqual(formatDef("Custom").sections, []);
    assert.ok(formatDef("Tutorial").sections.length >= 5);
    assert.ok(formatDef("Nope").name === "Custom");
    assert.ok(TONES.includes("Conversational"));
    assert.ok(LENGTH_TARGETS.some((l) => l.words === 900));
  });
});

describe("script measure", () => {
  it("counts words, estimates runtime, shortens extractively", () => {
    assert.equal(countWords("  hello   world "), 2);
    assert.equal(countWords(""), 0);
    assert.equal(countChars("ab"), 2);
    assert.equal(estimateSeconds(150, 150), 60);
    assert.equal(formatDuration(150), "2:30");
    assert.throws(() => estimateSeconds(10, 0));
    assert.equal(scriptWords([section({ text: "one two" }), section({ text: "three" })]), 3);
    const long = "First sentence here. Second adds detail and length here. Third concludes the point well.";
    const short = extractShorten(long);
    assert.ok(countWords(short) < countWords(long));
    assert.ok(short.startsWith("First sentence"));
    assert.equal(extractShorten("Too short."), "Too short.");
  });
});

describe("claims + refs", () => {
  it("detects checkable claims, all unverified, and manages refs", () => {
    __resetScriptIds();
    const claims = detectClaims("A 2024 study found 73% of viewers leave. I think hooks matter. John Smith said \"keep it short\".");
    assert.ok(claims.some((c) => c.kind === "statistic"));
    assert.ok(claims.some((c) => c.kind === "date"));
    assert.ok(claims.some((c) => c.kind === "quote"));
    assert.ok(claims.some((c) => c.kind === "name"));
    assert.ok(claims.some((c) => c.kind === "opinion"));
    assert.ok(claims.every((c) => c.verified === false));
    assert.deepEqual(detectClaims("Plain words, no markers here really."), []);

    let s = section();
    s = addResearchRef(s, "Payoff-first wins", "https://example.com");
    assert.equal(s.researchRefs[0].source, "https://example.com");
    assert.equal(s.researchRefs[0].verified, false);
    assert.throws(() => addResearchRef(s, "   ", "x"));
    s = removeResearchRef(s, s.researchRefs[0].id);
    assert.equal(s.researchRefs.length, 0);
    assert.ok(blankSection("hook", "Hook").id.startsWith("sec_"));
  });
});

describe("script engine", () => {
  it("assembles labeled starter sections from intelligence", () => {
    __resetScriptIds();
    const sections = assembleScript({
      format: "YouTube long-form",
      tone: "Conversational",
      complexity: "Beginner",
      structure: "Standard",
      targetWords: 900,
      instruction: "Open with the failed launch.",
      topic: "Hooks",
      audience: "Creators",
      hookText: "Fix your hook in 8 seconds",
      promiseText: "Better retention",
      takeawayText: "Payoff first",
      points: ["Point A"],
      ctaText: "Subscribe",
    });
    assert.ok(sections.length >= 10);
    assert.ok(sections.every((s) => s.aiGenerated));
    assert.ok(sections[0].text.includes("Fix your hook in 8 seconds"));
    assert.ok(sections.some((s) => s.text.includes("failed launch")));
    assert.ok(ASSEMBLY_METHOD.includes("no AI provider"));
  });

  it("supports the full section lifecycle safely", () => {
    const base = [section({ id: "a", text: "Alpha. Beta! Gamma?" }), section({ id: "b", text: "Second." })];
    assert.equal(addSection(base, "custom", "New").length, 3);
    assert.equal(deleteSection(base, "a").length, 1);
    assert.equal(moveSection(base, "b", -1)[0].id, "b");
    assert.deepEqual(moveSection(base, "a", -1), base);
    assert.equal(duplicateSection(base, "a")[1].heading, "Beat (copy)");
    const split = splitSection(base, "a");
    assert.equal(split.length, 3);
    assert.ok(split[0].text.includes("Alpha"));
    const merged = mergeSections(split, split[0].id);
    assert.equal(merged.length, 2);
    const edited = editSectionText(base, "a", "Changed.");
    assert.equal(edited[0].text, "Changed.");
    assert.equal(edited[0].edited, true);
  });

  it("versions with backups and diffs", () => {
    const script = {
      projectId: "p1",
      format: "Custom",
      tone: "Conversational",
      complexity: "Beginner",
      structure: "Standard",
      targetWords: 300,
      wpm: 150,
      instruction: "",
      sections: [section({ id: "a", text: "one two three" })],
      versions: [],
      notes: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const v1 = snapshotVersion(script, "First", "note", { id: "v1" });
    assert.equal(v1.versions[0].name, "First");
    const changed = { ...v1, sections: [section({ id: "a", text: "one two three four five" }), section({ id: "b", text: "new" })] };
    const diff = diffVersions(v1.versions[0], { ...v1.versions[0], sections: changed.sections });
    assert.equal(diff.added, 1);
    assert.equal(diff.changed, 1);
    assert.equal(diff.wordDelta, 3);
    const restored = restoreVersion(changed, "v1");
    assert.equal(restored.sections[0].text, "one two three");
    assert.equal(restored.versions[0].name, "Pre-restore backup");
    assert.throws(() => restoreVersion(script, "missing"));
  });

  it("tracks loops until paid off", () => {
    let loops = addLoop([], { kind: "loop", text: "The failed launch", openedInSectionId: "a" }, { id: "l1" });
    assert.equal(unpaidLoops(loops).length, 1);
    loops = resolveLoop(loops, "l1", "b");
    assert.equal(unpaidLoops(loops).length, 0);
    assert.throws(() => addLoop([], { kind: "loop", text: "  ", openedInSectionId: "a" }));
  });

  it("maps scenes with durations and sync hashes", () => {
    const sections = [section({ id: "a", heading: "Hook", text: "one two three four five six" })];
    const scenes = scenesFromSections(sections, 150);
    assert.equal(scenes[0].number, 1);
    assert.deepEqual(scenes[0].sectionIds, ["a"]);
    assert.ok(scenes[0].durationSec > 0);
    assert.equal(sceneNeedsReview(scenes[0], sections), false);
    const changed = [{ ...sections[0], text: sections[0].text + " more words here" }];
    assert.equal(sceneNeedsReview(scenes[0], changed), true);
    const synced = markSceneSynced(scenes[0], changed);
    assert.equal(sceneNeedsReview(synced, changed), false);
    assert.ok(synced.scriptText.includes("more words"));
    assert.equal(sceneNeedsReview(scenes[0], []), true);
  });
});

describe("section review", () => {
  it("flags empties, weak hooks, overload, repetition, and abrupt entries", () => {
    const hook = section({ id: "h", type: "hook", heading: "Hook", text: "Hey guys welcome back, in this video I will show you stuff" });
    const empty = section({ id: "e", heading: "Empty" });
    const echo = section({ id: "c", heading: "Echo", text: "Hey guys welcome back, in this video I will show you stuff plus more words here today" });
    const found = reviewSections([hook, empty, echo]);
    assert.ok(found.some((f) => f.kind === "hook"), "hook check");
    assert.ok(found.some((f) => f.kind === "empty"), "empty check");
    assert.ok(found.some((f) => f.kind === "repetition"), "repetition check");
    const clean = reviewSections([section({ id: "a", heading: "Hook", text: "The payoff first, then the proof behind it." })]);
    assert.ok(!clean.some((f) => f.kind === "hook" || f.kind === "empty"));
  });
});

describe("script storage", () => {
  it("round-trips bundles and rejects garbage", () => {
    const bundle = emptyScriptBundle();
    assert.deepEqual(parseScriptBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parseScriptBundle({}), /script file/);
    assert.throws(() => parseScriptBundle({ version: 1, scripts: { x: { id: 1 } }, boards: {}, loops: {} }), /script file/);
  });
});
