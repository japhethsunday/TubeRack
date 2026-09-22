import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sceneSegments,
  captionsFromNarration,
  buildFromScenes,
  durationOf,
  clipsAt,
  sceneAt,
  validateComposition,
  healthOf,
  emptyComposition,
  defaultTracks,
  __resetVideoIds,
} from "@/src/lib/video/build";
import {
  moveClip,
  trimClip,
  splitClipAt,
  duplicateClip,
  deleteClip,
  addClip,
  snapTime,
  snapCandidates,
  __resetClipIds,
} from "@/src/lib/video/ops";
import { PLATFORM_PRESETS, TRANSITIONS, EFFECTS, MOTIONS, TEXT_PRESETS, brandedTitleStyle, presetById } from "@/src/lib/video/presets";
import { emptyVideoBundle, parseVideoBundle } from "@/src/lib/video/storage";
import type { Scene } from "@/src/lib/script/types";
import type { MediaAsset } from "@/src/lib/media/types";
import type { TimelineClip } from "@/src/lib/video/types";

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "sc1",
    number: 1,
    title: "Hook",
    sectionIds: [],
    scriptText: "Payoff first. Then proof.",
    durationSec: 10,
    visual: "",
    narration: "Payoff first. Then proof.",
    onScreenText: "",
    transition: "",
    shot: "",
    broll: "",
    assetsNeeded: [],
    notes: "",
    sourceHash: "h1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "m1",
    projectId: "p1",
    sceneIds: [],
    kind: "image",
    source: "local-draft",
    status: "ready",
    title: "Still",
    payload: "<svg></svg>",
    mime: "image/svg+xml",
    tags: [],
    approval: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "c1",
    trackId: "track_image",
    kind: "image",
    name: "Still",
    startSec: 0,
    durationSec: 5,
    volume: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    ...overrides,
  };
}

describe("video build", () => {
  beforeEach(() => __resetVideoIds());

  it("tiles scene segments and derives durations", () => {
    const segs = sceneSegments([scene({ durationSec: 10 }), scene({ id: "sc2", durationSec: 5 })]);
    assert.deepEqual([segs[0].startSec, segs[1].startSec], [0, 10]);
    assert.equal(durationOf([clip(), clip({ id: "c2", startSec: 8, durationSec: 4 })]), 12);
    assert.equal(sceneAt(segs, 10)?.sceneId, "sc2");
    assert.equal(sceneAt(segs, 99), null);
    assert.equal(defaultTracks().length, 7);
    assert.ok(emptyComposition("p1").tracks.some((t) => t.kind === "captions"));
  });

  it("times captions across narration proportionally", () => {
    const caps = captionsFromNarration("First sentence here. Second follows along.", 10, 8);
    assert.equal(caps.length, 2);
    assert.equal(caps[0].startSec, 10);
    assert.ok(caps[1].startSec > caps[0].startSec);
    assert.ok(Math.abs(caps[0].durationSec + caps[1].durationSec - 8) < 1.2);
    assert.deepEqual(captionsFromNarration("", 0, 5), []);
    assert.deepEqual(captionsFromNarration("Hi.", 0, 0), []);
  });

  it("auto-builds image, voice, title, captions, and music bed", () => {
    __resetVideoIds();
    const scenes = [scene({ id: "sc1" }), scene({ id: "sc2", number: 2, title: "Payoff", narration: "" })];
    const assets = [
      asset({ id: "img1", sceneIds: ["sc1"] }),
      asset({ id: "vox1", kind: "voice", title: "Take", sceneIds: ["sc1"], durationSec: 6, payload: JSON.stringify({ text: "hi" }), mime: "application/x-tuberack-voice" }),
      asset({ id: "mus1", kind: "music", title: "Bed", sceneIds: [], durationSec: 30, payload: "{}", mime: "application/x-tuberack-music" }),
    ];
    const clips = buildFromScenes(scenes, assets);
    assert.ok(clips.some((c) => c.kind === "image" && c.assetId === "img1"));
    assert.ok(clips.some((c) => c.kind === "voice" && c.assetId === "vox1"));
    assert.ok(clips.some((c) => c.kind === "text"));
    assert.ok(clips.some((c) => c.kind === "captions"));
    assert.ok(clips.some((c) => c.kind === "music" && c.startSec === 0));
    const voice = clips.find((c) => c.kind === "voice");
    assert.ok((voice?.durationSec ?? 99) <= 10);
  });

  it("validates with actionable issues and honest health", () => {
    const scenes = [scene({ id: "sc1", narration: "This narration runs long with many words filling plenty of time today for a full voiceover take with room to spare" })];
    const empty = validateComposition({ ...emptyComposition("p1"), clips: [] }, scenes, []);
    assert.ok(empty.some((i) => i.severity === "block" && i.message.includes("no visual")));
    assert.ok(empty.some((i) => i.severity === "warn" && i.message.includes("no voice")));
    assert.equal(healthOf(empty), "blocked");

    const bad = validateComposition(
      { ...emptyComposition("p1"), clips: [clip({ assetId: "ghost" }), clip({ id: "c2", trackId: "track_image", kind: "image", name: "Req", assetId: "req", startSec: 0, durationSec: 2 })] },
      scenes,
      [asset({ id: "req", kind: "image", source: "provider-request", title: "Req", payload: "req" })],
    );
    assert.ok(bad.some((i) => i.message.includes("deleted asset")));
    assert.ok(bad.some((i) => i.message.includes("provider request")));

    const good = validateComposition(
      { ...emptyComposition("p1"), clips: [clip({ assetId: "m1", sceneId: "sc1" })] },
      [scene({ id: "sc1", narration: "" })],
      [asset({ id: "m1", sceneIds: ["sc1"] })],
    );
    assert.deepEqual(good, []);
    assert.equal(healthOf(good), "ready");
    assert.equal(healthOf([{ severity: "warn", message: "x", fix: "y" }]), "review");
    assert.ok(clipsAt([clip()], 2.5).length === 1 && clipsAt([clip()], 9).length === 0);
  });
});

describe("timeline ops", () => {
  beforeEach(() => __resetClipIds());

  it("moves with snapping, trims safely, splits, duplicates, deletes", () => {
    const clips = [clip(), clip({ id: "c2", startSec: 10, durationSec: 4 })];
    assert.equal(moveClip(clips, "c1", 2)[0].startSec, 2);
    assert.equal(moveClip(clips, "c1", -99)[0].startSec, 0);
    assert.equal(snapTime(9.9, snapCandidates(clips, "c1", 0, [0]), true), 10);
    assert.equal(snapTime(9.5, [], true), 9.5);
    assert.ok(snapCandidates(clips, "c9", 0, []).includes(10));

    const trimmed = trimClip(clips, "c1", "start", 1);
    assert.deepEqual([trimmed[0].startSec, trimmed[0].durationSec], [1, 4]);
    assert.equal(trimClip(clips, "c1", "end", -99)[0].durationSec, 0.5);

    const split = splitClipAt(clips, "c1", 2);
    assert.equal(split.length, 3);
    assert.deepEqual(splitClipAt(clips, "c1", 0.05), clips);
    const dup = duplicateClip(clips, "c1");
    assert.equal(dup.length, 3);
    assert.ok(dup[2].name.includes("(copy)"));
    assert.equal(deleteClip(clips, "c1").length, 1);
    assert.deepEqual(deleteClip(clips, "missing"), clips);
    assert.equal(splitClipAt(clips, "missing", 2), clips);
    assert.equal(duplicateClip(clips, "missing"), clips);
    assert.equal(addClip(clips, { trackId: "track_text", kind: "text", name: "T", startSec: 0, durationSec: 2, volume: 1, fadeInSec: 0, fadeOutSec: 0, muted: false }).length, 3);
  });
});

describe("video presets", () => {
  it("covers platforms, transitions, effects, motions, text", () => {
    assert.equal(PLATFORM_PRESETS.length, 6);
    assert.equal(presetById("shorts").aspect, "9:16");
    assert.equal(presetById("nope").id, "youtube");
    assert.equal(TRANSITIONS.length, 6);
    assert.ok(EFFECTS.some((e) => e.id === "saturation"));
    assert.ok((MOTIONS as readonly string[]).includes("kenburns"));
    assert.equal(TEXT_PRESETS.length, 6);
    assert.equal(brandedTitleStyle("#ff0000", "").color, "#ff0000");
    assert.equal(brandedTitleStyle("  ", "").color, "#ffffff");
  });
});

describe("video storage", () => {
  it("round-trips bundles and rejects garbage", () => {
    const bundle = emptyVideoBundle();
    assert.deepEqual(parseVideoBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parseVideoBundle({}), /video file/);
    assert.throws(() => parseVideoBundle({ version: 1, compositions: [{ projectId: 1 }], snapshots: [], requests: [] }), /video file/);
  });
});
