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

import { jamendoTrack, licenseFromUrl } from "@/src/server/music/library";

test("Jamendo licenses: commercial-use only", () => {
  assert.equal(licenseFromUrl("http://creativecommons.org/licenses/by-sa/3.0/"), "CC BY-SA 3.0");
  assert.equal(licenseFromUrl("http://creativecommons.org/licenses/by-nc-sa/3.0/"), null);
  assert.equal(licenseFromUrl("http://creativecommons.org/licenses/by-nd/4.0/"), null);
});

test("Jamendo track maps with credit and download", () => {
  const t = jamendoTrack({ id: "123", name: "Rise Up", artist_name: "Kai", duration: 150, audio: "https://a/stream.mp3", audiodownload: "https://a/dl.mp3", license_ccurl: "http://creativecommons.org/licenses/by/3.0/" })!;
  assert.equal(t.id, "jm-123");
  assert.match(t.attribution, /Rise Up.*Kai.*CC BY 3.0/);
  assert.equal(jamendoTrack({ id: "1", name: "x", audio: "https://a", license_ccurl: "http://creativecommons.org/licenses/by-nc/3.0/" }), null);
});
