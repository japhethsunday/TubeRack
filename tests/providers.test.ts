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
    assert.deepEqual(providers.map((p) => p.provider), ["gemini", "mistral", "nvidia", "youtube", "resend"]);
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

describe("youtube referer", () => {
  it("derives an origin referer for referrer-restricted keys", async () => {
    const { apiReferer } = await import("@/src/server/youtube/client");
    const { getServerEnv } = await import("@/src/lib/env");
    assert.equal(apiReferer(getServerEnv({ YOUTUBE_API_REFERER: "https://tube-rack.vercel.app/some/path" } as unknown as NodeJS.ProcessEnv)), "https://tube-rack.vercel.app/");
    assert.equal(apiReferer(getServerEnv({ APP_URL: "https://example.com" } as unknown as NodeJS.ProcessEnv)), "https://example.com/");
  });
});

import { extractJsonObject, repairTruncated } from "@/src/lib/ai-gateway/json";

describe("tolerant JSON extraction", () => {
  it("handles fences, surrounding prose, and trailing commas", () => {
    assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJsonObject('Sure! Here it is:\n{"a":[1,2,],}\nHope that helps.'), { a: [1, 2] });
    assert.equal(extractJsonObject("no json here"), null);
    assert.equal(extractJsonObject("[1,2]"), null);
  });

  it("repairs a reply cut off mid-array, keeping only complete values", () => {
    const cut = '{"niches":[{"name":"A","query":"a"},{"name":"B","query":"b"},{"name":"C","que';
    const obj = extractJsonObject(cut) as { niches: { name: string; query?: string }[] };
    assert.deepEqual(obj.niches, [{ name: "A", query: "a" }, { name: "B", query: "b" }, { name: "C" }]);
  });

  it("repairs a cut inside a string and leaves complete JSON untouched", () => {
    const obj = extractJsonObject('{"summary":"ok","ideas":["one","tw') as { summary: string; ideas: string[] };
    assert.equal(obj.summary, "ok");
    assert.deepEqual(obj.ideas, ["one"]);
    assert.equal(repairTruncated('{"a":1}'), '{"a":1}');
    assert.equal(repairTruncated('{"a'), null);
  });
});
