import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import { toSrt, toVtt, WhisperXTranscriptionProvider } from "@/src/server/ai/whisperx";
import { PiperTtsProvider } from "@/src/server/ai/piper";
import { ComfyUIImageProvider } from "@/src/server/ai/comfyui";
import { AceStepMusicProvider } from "@/src/server/ai/acestep";
import { ExternalRenderingProvider } from "@/src/server/ai/rendiv";
import { describeProviders } from "@/src/server/ai/registry";
import {
  burnSubtitlesArgs,
  concatArgs,
  mixArgs,
  scaleArgs,
  thumbnailArgs,
  trimArgs,
  FFmpegError,
} from "@/src/server/media/ffmpeg";

/** Hermetic: pure builders + stubbed HTTP — no binaries, no network. */
describe("ffmpeg arg builders", () => {
  it("builds trim/concat/scale/mix/subtitle/thumbnail commands", () => {
    assert.deepEqual(trimArgs("in.mp4", "out.mp4", 5, 15), ["-y", "-ss", "5", "-i", "in.mp4", "-to", "15", "-c", "copy", "out.mp4"]);
    const concat = concatArgs(["a.mp4", "b.mp4"], "out.mp4");
    assert.ok(concat.args.includes("concat"));
    assert.ok(concat.fileList.includes("a.mp4"));
    assert.ok(scaleArgs("in.mp4", "out.mp4", 1920, 1080).join(" ").includes("scale=1920:1080"));
    assert.ok(mixArgs("n.wav", "m.wav", "out.wav").join(" ").includes("amix"));
    assert.ok(burnSubtitlesArgs("in.mp4", "cap.srt", "out.mp4").join(" ").includes("subtitles="));
    assert.ok(thumbnailArgs("in.mp4", "t.png", 2, 640).join(" ").includes("scale=640:-1"));
  });

  it("rejects invalid dimensions, volumes, and tiny concats", () => {
    assert.throws(() => scaleArgs("i", "o", 0, 1080), FFmpegError);
    assert.throws(() => scaleArgs("i", "o", 9000, 1080), FFmpegError);
    assert.throws(() => mixArgs("a", "b", "o", 0), FFmpegError);
    assert.throws(() => mixArgs("a", "b", "o", 2), FFmpegError);
    assert.throws(() => concatArgs(["only.mp4"], "o"), FFmpegError);
    assert.throws(() => trimArgs("i", "o", -1), FFmpegError);
  });
});

describe("transcript subtitle builders", () => {
  const segments = [
    { startSec: 0.5, endSec: 2.25, text: "Hello" },
    { startSec: 61.0, endSec: 63.5, text: "World" },
  ];

  it("emits valid SRT", () => {
    const srt = toSrt(segments);
    assert.ok(srt.includes("00:00:00,500 --> 00:00:02,250"));
    assert.ok(srt.includes("00:01:01,000 --> 00:01:03,500"));
  });

  it("emits valid WebVTT", () => {
    const vtt = toVtt(segments);
    assert.ok(vtt.startsWith("WEBVTT"));
    assert.ok(vtt.includes("00:00:00.500 --> 00:00:02.250"));
  });
});

describe("self-hosted adapters stay honest when unconfigured", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.WHISPERX_URL;
    delete process.env.PIPER_URL;
    delete process.env.COMFYUI_URL;
    delete process.env.COMFYUI_WORKFLOW;
    delete process.env.ACE_STEP_URL;
    delete process.env.RENDIV_URL;
    __resetEnvCache();
  });

  it("each adapter throws the boundary error without its URL", async () => {
    __resetEnvCache();
    await assert.rejects(() => new WhisperXTranscriptionProvider().transcribe({ audioBase64: "AAA" }), ProviderNotConfiguredError);
    await assert.rejects(() => new PiperTtsProvider().synthesizeSpeech({ text: "hi" }), ProviderNotConfiguredError);
    await assert.rejects(() => new ComfyUIImageProvider().generateImage({ prompt: "hi" }), ProviderNotConfiguredError);
    await assert.rejects(() => new AceStepMusicProvider().composeMusic({ prompt: "hi" }), ProviderNotConfiguredError);
    await assert.rejects(() => new ExternalRenderingProvider().render({ composition: {} }), ProviderNotConfiguredError);
  });

  it("whisperx maps segments over stubbed HTTP", async () => {
    process.env.WHISPERX_URL = "http://whisperx:8001";
    __resetEnvCache();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          text: "hello world",
          language: "en",
          segments: [{ start: 0, end: 1.5, text: "hello world" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    try {
      const out = await new WhisperXTranscriptionProvider().transcribe({ audioBase64: "AAA" });
      assert.equal(out.text, "hello world");
      assert.deepEqual(out.segments, [{ startSec: 0, endSec: 1.5, text: "hello world" }]);
      assert.equal(out.model, "whisperx");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("comfyui queues, polls, and returns a data URL over stubbed HTTP", async () => {
    process.env.COMFYUI_URL = "http://comfy:8188";
    process.env.COMFYUI_WORKFLOW = JSON.stringify({ "1": { inputs: { text: "{{PROMPT}}" } } });
    __resetEnvCache();
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        return new Response(JSON.stringify({ prompt_id: "p1" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/history/")) {
        return new Response(
          JSON.stringify({ p1: { outputs: { "9": { images: [{ filename: "out.png", subfolder: "", type: "output" }] } } } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(Buffer.from([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } });
    }) as typeof fetch;
    try {
      const out = await new ComfyUIImageProvider().generateImage({ prompt: "a circle" });
      assert.ok(out.url.startsWith("data:image/png;base64,"));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("provider registry", () => {
  it("describes every provider with presence only (no secrets)", () => {
    const providers = describeProviders();
    const names = providers.map((p) => p.provider);
    for (const expected of ["gemini", "youtube", "whisperx", "piper", "comfyui", "ace-step", "rendiv", "ffmpeg"]) {
      assert.ok(names.includes(expected), expected);
    }
    const json = JSON.stringify(providers);
    assert.ok(!/sk-|AIza|BEGIN|SECRET/i.test(json));
    for (const p of providers) {
      assert.equal(typeof p.configured, "boolean");
      assert.ok(Array.isArray(p.capabilities) && p.capabilities.length > 0);
    }
  });
});
