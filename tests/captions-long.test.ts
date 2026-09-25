import { test } from "node:test";
import assert from "node:assert/strict";
import { pcmToWavBase64, splitWav, wavDurationSec } from "@/src/server/ai/gemini";

function wav(seconds: number, rate = 24000): Uint8Array {
  const pcm = Buffer.alloc(seconds * rate * 2);
  for (let i = 0; i < seconds * rate; i++) {
    // Speech-like bursts with a short pause every 10 s.
    const t = i / rate;
    const loud = t % 10 > 0.4;
    pcm.writeInt16LE(loud ? Math.round(8000 * Math.sin(i / 7)) : 0, i * 2);
  }
  return new Uint8Array(Buffer.from(pcmToWavBase64(pcm.toString("base64"), rate), "base64"));
}

test("long voice-overs split into valid pieces that add up to the whole take", () => {
  const take = wav(430); // 7:10, ~20 MB
  assert.ok(take.byteLength > 18 * 1024 * 1024);
  const pieces = splitWav(take, 180);
  assert.equal(pieces.length, 3);
  const total = pieces.reduce((s, p) => s + (wavDurationSec(p.bytes) ?? 0), 0);
  assert.ok(Math.abs(total - 430) < 0.01);
  assert.equal(pieces[0].offsetSec, 0);
  for (let i = 1; i < pieces.length; i++) {
    assert.ok(Math.abs(pieces[i].offsetSec - (pieces[i - 1].offsetSec + (wavDurationSec(pieces[i - 1].bytes) ?? 0))) < 0.001);
    // Cut lands in a pause (the silent first 0.4 s of a 10 s block).
    assert.ok(pieces[i].offsetSec % 10 < 0.45, `cut at ${pieces[i].offsetSec}`);
  }
  assert.equal(splitWav(wav(60), 180).length, 1);
});

test("high-quality takes are cut into pieces small enough for one request", () => {
  const rate = 48000;
  const pcm = Buffer.alloc(200 * rate * 2);
  const take = new Uint8Array(Buffer.from(pcmToWavBase64(pcm.toString("base64"), rate), "base64"));
  const pieces = splitWav(take, 180);
  assert.ok(pieces.length >= 2);
  for (const p of pieces) assert.ok(p.bytes.byteLength <= 14.2 * 1024 * 1024, `${p.bytes.byteLength}`);
});
