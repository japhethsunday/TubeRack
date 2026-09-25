import { test } from "node:test";
import assert from "node:assert/strict";
import { toTrack } from "@/src/server/music/library";

const base = { id: "0b8c1a7e-1111-4222-8333-944455556666", title: "Morning Light", creator: "Ana", license: "by", license_version: "4.0", license_url: "https://creativecommons.org/licenses/by/4.0/", url: "https://cdn.example/track.mp3", filetype: "mp3", duration: 125000 };

test("keeps a commercial-use instrumental and builds its credit line", () => {
  const t = toTrack(base)!;
  assert.equal(t.license, "CC BY 4.0");
  assert.equal(t.durationSec, 125);
  assert.match(t.attribution, /Morning Light.*Ana/);
});

test("drops vocal tracks, non-commercial licenses and unsupported formats", () => {
  assert.equal(toTrack({ ...base, title: "Morning Light (feat. Joe) vocal mix" }), null);
  assert.equal(toTrack({ ...base, tags: [{ name: "singing" }] }), null);
  assert.equal(toTrack({ ...base, license: "by-nc" }), null);
  assert.equal(toTrack({ ...base, filetype: "flac", url: "https://cdn.example/t.flac" }), null);
});
