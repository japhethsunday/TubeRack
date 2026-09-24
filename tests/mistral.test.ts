import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { toCaptionLines, wavToPcm } from "@/src/server/ai/mistral";
import { GeminiTextProvider, GeminiTtsProvider, pcmToWavBase64 } from "@/src/server/ai/gemini";

const realFetch = globalThis.fetch;
const saved = { ...process.env };

function useEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetEnvCache();
}

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
  __resetEnvCache();
});

const wav = (samples: number, rate = 24000) => Buffer.from(pcmToWavBase64(Buffer.alloc(samples * 2, 1).toString("base64"), rate), "base64");

describe("mistral", () => {
  it("reads PCM and sample rate out of a WAV file", () => {
    const { pcm, rate } = wavToPcm(wav(480, 22050));
    assert.equal(rate, 22050);
    assert.equal(pcm.length, 960);
  });

  it("splits long transcript segments into timed caption lines", () => {
    const lines = toCaptionLines([{ startSec: 0, endSec: 10, text: "one two three four five six seven eight nine ten" }], 5);
    assert.deepEqual(lines, [
      { startSec: 0, endSec: 5, text: "one two three four five" },
      { startSec: 5, endSec: 10, text: "six seven eight nine ten" },
    ]);
  });

  it("writes with Mistral first, then NVIDIA, when Gemini isn't set up", async () => {
    useEnv({ GEMINI_API_KEY: undefined, MISTRAL_API_KEY: "m", MISTRAL_TEXT_MODELS: "mistral-large-latest", NVIDIA_API_KEY: "n", NVIDIA_TEXT_MODELS: "meta/x" });
    const hosts: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      hosts.push(new URL(url).host + new URL(url).pathname);
      if (url.endsWith("/models")) return Response.json({ data: [{ id: "mistral-large-latest" }, { id: "meta/x" }] });
      if (url.includes("mistral.ai")) return new Response("rate limited", { status: 429 });
      return Response.json({ choices: [{ message: { content: "From NVIDIA" } }] });
    }) as typeof fetch;
    const out = await new GeminiTextProvider().generateText({ prompt: "write" });
    assert.deepEqual(out, { text: "From NVIDIA", model: "meta/x" });
    assert.ok(hosts.indexOf("api.mistral.ai/v1/chat/completions") < hosts.indexOf("integrate.api.nvidia.com/v1/chat/completions"));
  });

  it("voices a full take with Voxtral when Gemini isn't set up", async () => {
    useEnv({ GEMINI_API_KEY: undefined, MISTRAL_API_KEY: "m" });
    let calls = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      assert.ok(String(input).endsWith("/v1/audio/speech"));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "voxtral-mini-tts-2603");
      calls++;
      return Response.json({ audio_data: wav(2400).toString("base64") });
    }) as typeof fetch;
    const text = Array.from({ length: 60 }, (_, i) => `Sentence ${i} is here to make this long.`).join(" ");
    const out = await new GeminiTtsProvider().synthesizeSpeech({ text });
    assert.ok(calls >= 2, "long text is split into several requests");
    assert.equal(out.mimeType, "audio/wav");
    assert.ok(out.durationSec > 0.1 * calls);
  });
});
