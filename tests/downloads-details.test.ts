import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseIsoDuration } from "@/src/server/youtube/client";
import { toSrt } from "@/src/components/video/GeminiCaptions";
import { safeFileName, extFromMime, audioBufferToWav } from "@/src/lib/download";

describe("video details helpers", () => {
  it("parses ISO-8601 durations", () => {
    assert.equal(parseIsoDuration("PT4M13S"), 253);
    assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
    assert.equal(parseIsoDuration("PT45S"), 45);
    assert.equal(parseIsoDuration("P1DT1S"), 86401);
    assert.equal(parseIsoDuration("garbage"), null);
  });
});

describe("downloads", () => {
  it("builds safe file names and extensions", () => {
    assert.equal(safeFileName("My Video: Part 1?", "md"), "My-Video-Part-1.md");
    assert.equal(safeFileName("", "txt"), "tuberack.txt");
    assert.equal(safeFileName("take.wav", "wav"), "take.wav");
    assert.equal(extFromMime("image/png"), "png");
    assert.equal(extFromMime("audio/wav"), "wav");
    assert.equal(extFromMime("audio/mpeg"), "mp3");
    assert.equal(extFromMime("application/x-unknown", "bin"), "bin");
  });

  it("writes valid SRT", () => {
    const srt = toSrt([
      { startSec: 0, endSec: 1.5, text: "Hello" },
      { startSec: 61.25, endSec: 3725.001, text: "World" },
    ]);
    assert.equal(srt, "1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:01:01,250 --> 01:02:05,001\nWorld\n");
  });

  it("encodes an AudioBuffer as a 16-bit WAV", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const fake = { numberOfChannels: 1, sampleRate: 8000, length: 4, getChannelData: () => samples } as unknown as AudioBuffer;
    const blob = audioBufferToWav(fake);
    const bytes = new DataView(await blob.arrayBuffer());
    assert.equal(blob.size, 44 + 8);
    assert.equal(String.fromCharCode(bytes.getUint8(8), bytes.getUint8(9), bytes.getUint8(10), bytes.getUint8(11)), "WAVE");
    assert.equal(bytes.getUint32(24, true), 8000);
    assert.equal(bytes.getInt16(46, true), Math.trunc(0.5 * 0x7fff));
    assert.equal(bytes.getInt16(48, true), -0x4000);
    assert.equal(bytes.getInt16(50, true), 0x7fff);
  });
});
