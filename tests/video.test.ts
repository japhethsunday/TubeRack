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
    const scenes = [scene({ id: "sc1", onScreenText: "3 rules that work" }), scene({ id: "sc2", number: 2, title: "Payoff", narration: "" })];
    const assets = [
      asset({ id: "img1", sceneIds: ["sc1"] }),
      asset({ id: "vox1", kind: "voice", title: "Take", sceneIds: ["sc1"], durationSec: 6, payload: JSON.stringify({ text: "hi" }), mime: "application/x-tuberack-voice" }),
      asset({ id: "mus1", kind: "music", title: "Bed", sceneIds: [], durationSec: 30, payload: "{}", mime: "application/x-tuberack-music" }),
    ];
    const clips = buildFromScenes(scenes, assets);
    assert.ok(clips.some((c) => c.kind === "image" && c.assetId === "img1"));
    assert.ok(clips.some((c) => c.kind === "voice" && c.assetId === "vox1"));
    // Overlay copy only — script headings never appear on screen.
    assert.ok(clips.some((c) => c.kind === "text" && c.text === "3 rules that work"));
    assert.ok(!clips.some((c) => c.kind === "text" && c.text === "Payoff"));
    assert.ok(clips.some((c) => c.kind === "captions"));
    assert.ok(clips.some((c) => c.kind === "music" && c.startSec === 0));
    const voice = clips.find((c) => c.kind === "voice");
    assert.ok((voice?.durationSec ?? 99) <= 10);
  });

  it("validates with actionable issues and honest health", () => {
    const scenes = [scene({ id: "sc1", narration: "This narration runs long with many words filling plenty of time today for a full voiceover take with room to spare" })];
    const empty = validateComposition({ ...emptyComposition("p1"), clips: [] }, scenes, []);
    assert.ok(empty.some((i) => i.severity === "block" && i.message.includes("Timeline is empty")));
    assert.equal(healthOf(empty), "blocked");
    // Scene-built timelines still get storyboard checks.
    const sceneBuilt = validateComposition({ ...emptyComposition("p1"), clips: [clip({ id: "v", kind: "voice", trackId: "track_voice", sceneId: "other" })] }, scenes, []);
    assert.ok(sceneBuilt.some((i) => i.severity === "warn" && i.message.includes("no visual")));
    assert.ok(sceneBuilt.some((i) => i.severity === "warn" && i.message.includes("no voice")));
    // Imported-video projects need no storyboard.
    const imported = validateComposition({ ...emptyComposition("p1"), clips: [clip({ assetId: "m1" })] }, [], [asset({ id: "m1" })]);
    assert.deepEqual(imported, []);

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

import { pasteClips, rippleDelete, maxDurationFor, trimClip as trim2, splitClipAt as split2 } from "@/src/lib/video/ops";
import { newTrack as newTrack2, defaultTracks as defaultTracks2 } from "@/src/lib/video/build";

describe("non-destructive editing", () => {
  it("trims and splits move the source in-point", () => {
    const base = [clip({ id: "v1", kind: "video", startSec: 10, durationSec: 20, inSec: 5, speed: 2 })];
    const trimmed = trim2(base, "v1", "start", 3)[0];
    assert.equal(trimmed.startSec, 13);
    assert.equal(trimmed.durationSec, 17);
    assert.equal(trimmed.inSec, 11); // 5 + 3s × 2 speed
    // Can't trim left past the start of the source.
    assert.equal(trim2(base, "v1", "start", -100)[0].inSec, 0);
    const [a, b] = split2(base, "v1", 16);
    assert.equal(a.durationSec, 6);
    assert.equal(b.startSec, 16);
    assert.equal(b.inSec, 17);
  });

  it("pastes, ripple-deletes, caps duration, and adds tracks", () => {
    const clips = [clip({ id: "a", startSec: 0, durationSec: 5 }), clip({ id: "b", startSec: 5, durationSec: 5 })];
    const { clips: out, pastedIds } = pasteClips(clips, clips, 20);
    assert.equal(out.length, 4);
    assert.deepEqual(out.filter((c) => pastedIds.includes(c.id)).map((c) => c.startSec), [20, 25]);
    assert.deepEqual(rippleDelete(clips, "a").map((c) => c.startSec), [0]);
    assert.equal(maxDurationFor(clip({ kind: "video", inSec: 10, speed: 2 }), 30), 10);
    assert.equal(maxDurationFor(clip({ kind: "image" }), 30), null);
    const t = newTrack2("video", defaultTracks2());
    assert.equal(t.label, "Video 2");
    assert.notEqual(t.id, "track_video");
  });
});

import { sourceTime, transitionState, visualStack, filterString } from "@/src/lib/video/compositor";
import { NEUTRAL_FILTERS } from "@/src/lib/video/types";

describe("frame compositor", () => {
  it("maps timeline time to source time with in-point, speed, and reverse", () => {
    const c = clip({ kind: "video", startSec: 10, durationSec: 4, inSec: 2, speed: 2 });
    assert.equal(sourceTime(c, 10), 2);
    assert.equal(sourceTime(c, 11), 4);
    assert.equal(sourceTime({ ...c, reverse: true }, 10), 10); // starts at the end of the used range
    assert.equal(sourceTime({ ...c, reverse: true }, 13), 4);
    assert.ok(sourceTime(c, 13.9, 5) <= 5); // clamped to the source length
  });

  it("computes fades and transitions", () => {
    const c = clip({ startSec: 0, durationSec: 4, fadeInSec: 1, fadeOutSec: 0, transitionOut: "slide" });
    assert.equal(transitionState(c, 0.5).alpha, 0.5);
    assert.equal(transitionState(c, 2).alpha, 1);
    assert.ok(transitionState(c, 3.9).dx > 0);
    assert.ok(transitionState({ ...c, transitionIn: "wipe" }, 0.1).wipe < 1);
  });

  it("stacks visible layers in track order with captions on top", () => {
    const comp = {
      ...emptyComposition("p"),
      clips: [
        clip({ id: "cap", kind: "captions", trackId: "track_captions", text: "hi" }),
        clip({ id: "img", kind: "image", trackId: "track_image" }),
        clip({ id: "vid", kind: "video", trackId: "track_video" }),
        clip({ id: "txt", kind: "text", trackId: "track_text", text: "t" }),
      ],
    };
    assert.deepEqual(visualStack(comp, 1).map((c) => c.id), ["vid", "img", "txt", "cap"]);
    const hidden = { ...comp, tracks: comp.tracks.map((t) => (t.kind === "image" ? { ...t, hidden: true } : t)) };
    assert.ok(!visualStack(hidden, 1).some((c) => c.id === "img"));
  });

  it("builds CSS filter strings only for changed values", () => {
    assert.equal(filterString(NEUTRAL_FILTERS, 1), "none");
    assert.equal(filterString({ ...NEUTRAL_FILTERS, brightness: 120, grayscale: 100, blur: 4 }, 0.5), "brightness(120%) blur(2.0px) grayscale(100%)");
  });
});
