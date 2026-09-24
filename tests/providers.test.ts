import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import { describeProviders } from "@/src/server/ai/registry";
import { transcribeAudio } from "@/src/server/ai/gemini";
import { captionsFromSegments } from "@/src/lib/video/build";

const savedKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
  __resetEnvCache();
});

describe("provider registry", () => {
  it("describes the cloud providers with presence only (no secrets)", () => {
    const providers = describeProviders();
    assert.deepEqual(providers.map((p) => p.provider), ["gemini", "youtube", "resend"]);
    const json = JSON.stringify(providers);
    assert.ok(!/sk-|AIza|re_[A-Za-z0-9]|BEGIN|SECRET/i.test(json));
    for (const p of providers) {
      assert.equal(typeof p.configured, "boolean");
      assert.equal(p.gpuRequired, false);
      assert.ok(Array.isArray(p.capabilities) && p.capabilities.length > 0);
    }
    assert.ok(providers[0].capabilities.includes("transcription"));
  });
});

describe("gemini transcription", () => {
  it("throws the boundary error when Gemini is not configured (no fake captions)", async () => {
    delete process.env.GEMINI_API_KEY;
    __resetEnvCache();
    await assert.rejects(transcribeAudio(new Uint8Array([1, 2, 3]), "audio/wav"), ProviderNotConfiguredError);
  });
});

describe("captions from transcription", () => {
  it("offsets segments to the voice clip and drops malformed ones", () => {
    const clips = captionsFromSegments(
      [
        { startSec: 0, endSec: 1.5, text: "Hello there." },
        { startSec: 1.5, endSec: 1.5, text: "zero length" },
        { startSec: 2, endSec: 3, text: "  " },
        { startSec: 3, endSec: 4.2, text: "General Kenobi." },
      ],
      10,
    );
    assert.equal(clips.length, 2);
    assert.equal(clips[0].kind, "captions");
    assert.equal(clips[0].startSec, 10);
    assert.equal(clips[1].startSec, 13);
    assert.equal(clips[1].text, "General Kenobi.");
  });
});
