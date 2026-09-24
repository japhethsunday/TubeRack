import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pcmToWavBase64 } from "@/src/server/ai/gemini";
import { parseVideoId } from "@/src/server/youtube/client";
import { providerFailure } from "@/src/server/ai/guard";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import { BackendError } from "@/src/server/errors";

describe("provider integration helpers", () => {
  it("wraps raw 16-bit PCM in a valid WAV header", () => {
    const pcm = Buffer.alloc(480); // 10ms at 24kHz mono 16-bit
    const wav = Buffer.from(pcmToWavBase64(pcm.toString("base64"), 24000), "base64");
    assert.equal(wav.length, 44 + 480);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 480);
  });

  it("parses every common YouTube URL form and rejects others", () => {
    const id = "dQw4w9WgXcQ";
    for (const input of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?t=10`,
      `https://m.youtube.com/watch?v=${id}&feature=share`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
    ]) {
      assert.equal(parseVideoId(input), id, input);
    }
    for (const bad of ["", "hello", "https://example.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/short"]) {
      assert.equal(parseVideoId(bad), null, bad);
    }
  });

  it("maps provider failures to safe API errors", () => {
    const missing = providerFailure(new ProviderNotConfiguredError("text"), "Gemini");
    assert.equal(missing.code, "BACKEND_UNAVAILABLE");
    const failed = providerFailure(new Error("Gemini text generation failed: quota"), "Gemini");
    assert.equal(failed.code, "INTERNAL_ERROR");
    assert.match(failed.message, /quota/);
    const passthrough = new BackendError("UNAUTHORIZED", "Sign in to continue.");
    assert.equal(providerFailure(passthrough, "Gemini"), passthrough);
  });
});
