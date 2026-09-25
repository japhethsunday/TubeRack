import { test } from "node:test";
import assert from "node:assert/strict";
import { mixGain, voiceRanges, MUSIC_BASE, MUSIC_DUCK } from "@/src/lib/video/mix";
import type { TimelineClip, TimelineTrack } from "@/src/lib/video/types";

const tracks: TimelineTrack[] = [
  { id: "v", kind: "voice", label: "Voice", muted: false, hidden: false, volume: 1 },
  { id: "m", kind: "music", label: "Music", muted: false, hidden: false, volume: 0.5 },
];
const clip = (id: string, trackId: string, kind: TimelineClip["kind"], startSec: number, durationSec: number): TimelineClip =>
  ({ id, trackId, kind, name: id, startSec, durationSec, volume: 1, fadeInSec: 0, fadeOutSec: 0, muted: false }) as TimelineClip;

test("voice and music have independent levels; music ducks under voice", () => {
  const voice = clip("a", "v", "voice", 10, 5);
  const music = clip("b", "m", "music", 0, 60);
  const comp = { tracks, clips: [voice, music] };
  assert.equal(mixGain(comp, voice, 12), 1);
  assert.equal(mixGain(comp, music, 2), 0.5 * MUSIC_BASE);
  assert.equal(mixGain(comp, music, 12), 0.5 * MUSIC_BASE * MUSIC_DUCK);
  assert.deepEqual(voiceRanges(comp), [[10, 15]]);
  const muted = { tracks: tracks.map((t) => (t.id === "v" ? { ...t, muted: true } : t)), clips: [voice, music] };
  assert.equal(mixGain(muted, music, 12), 0.5 * MUSIC_BASE);
});

import { durationOf } from "@/src/lib/video/build";

test("a long background song doesn't make the video longer than its content", () => {
  const v = clip("v1", "vt", "image", 0, 180);
  const m = clip("m1", "m", "music", 0, 7178);
  assert.equal(durationOf([v, m]), 180);
  assert.equal(durationOf([m]), 7178);
});

import { sceneSpeech } from "@/src/lib/script/engine";

test("voice uses the full script when narration was a cut-off copy", () => {
  const full = "word ".repeat(120).trim();
  assert.equal(sceneSpeech({ narration: full.slice(0, 280), scriptText: full }), full);
  assert.equal(sceneSpeech({ narration: "My own narration.", scriptText: full }), "My own narration.");
  assert.equal(sceneSpeech({ narration: "", scriptText: full }), full);
});
