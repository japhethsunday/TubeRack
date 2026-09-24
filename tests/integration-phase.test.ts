import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { gateway, probeHealth } from "@/src/server/ai/gateway";
import { JOB_INPUTS, storageKeyFor, executeJob, PermanentJobError, signCompositionMedia } from "@/src/server/jobs/runner";
import { PiperTtsProvider } from "@/src/server/ai/piper";
import { AceStepMusicProvider } from "@/src/server/ai/acestep";
import { captionsFromSegments } from "@/src/lib/video/build";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import type { JobRow } from "@/src/server/jobs/store";

const ENV_KEYS = ["GEMINI_API_KEY", "COMFYUI_URL", "COMFYUI_WORKFLOW", "PIPER_URL", "ACE_STEP_URL", "WHISPERX_URL", "RENDIV_URL"];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
const realFetch = globalThis.fetch;

function withEnv(values: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
  __resetEnvCache();
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetEnvCache();
  globalThis.fetch = realFetch;
});

const job = (type: JobRow["type"], input: unknown): JobRow =>
  ({ id: "j1", workspace_id: "ws-a", type, input, status: "processing" }) as unknown as JobRow;

describe("gateway routing", () => {
  it("reports unconfigured capabilities with the boundary error (no fake output)", () => {
    withEnv({});
    assert.throws(() => gateway.image(), ProviderNotConfiguredError);
    assert.throws(() => gateway.music(), ProviderNotConfiguredError);
    assert.throws(() => gateway.transcription(), ProviderNotConfiguredError);
    assert.throws(() => gateway.render(), ProviderNotConfiguredError);
    assert.deepEqual(gateway.available(), { image: [], tts: [], music: [], transcription: [], render: [] });
  });

  it("routes to configured adapters and refuses a named unconfigured one", () => {
    withEnv({ PIPER_URL: "http://piper.local", ACE_STEP_URL: "http://ace.local" });
    assert.equal(gateway.tts().name, "piper");
    assert.equal(gateway.music().name, "ace-step");
    assert.throws(() => gateway.tts("gemini"), /not configured/);
    assert.throws(() => gateway.image("nope"), /Unknown/);
  });
});

describe("provider adapters under failure", () => {
  it("surfaces unreachable and malformed provider responses as errors", async () => {
    withEnv({ PIPER_URL: "http://piper.local", ACE_STEP_URL: "http://ace.local" });
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await assert.rejects(new PiperTtsProvider().synthesizeSpeech({ text: "hi" }), /unreachable/);
    globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;
    await assert.rejects(new AceStepMusicProvider().composeMusic({ prompt: "lofi" }), /unexpected response/);
    globalThis.fetch = (async () => Response.json({ audio_base64: "" })) as typeof fetch;
    await assert.rejects(new AceStepMusicProvider().composeMusic({ prompt: "lofi" }), /empty audio/);
  });

  it("health probes distinguish healthy, unreachable, and not configured", async () => {
    assert.equal(await probeHealth(undefined), "not-configured");
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    assert.equal(await probeHealth("http://svc.local"), "healthy");
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    assert.equal(await probeHealth("http://svc.local"), "unreachable");
    globalThis.fetch = (async () => {
      throw new Error("timeout");
    }) as typeof fetch;
    assert.equal(await probeHealth("http://svc.local"), "unreachable");
  });
});

describe("job runner", () => {
  it("validates job inputs strictly", () => {
    assert.ok(JOB_INPUTS.generation.safeParse({ kind: "image", prompt: "a cat" }).success);
    assert.ok(!JOB_INPUTS.generation.safeParse({ kind: "image", prompt: "" }).success);
    assert.ok(JOB_INPUTS.audio.safeParse({ kind: "music", prompt: "lofi", durationSec: 30 }).success);
    assert.ok(!JOB_INPUTS.audio.safeParse({ kind: "music", prompt: "lofi", durationSec: 9999 }).success);
    assert.ok(!JOB_INPUTS.transcription.safeParse({ file: "https://evil.example/a.wav" }).success);
    assert.ok(!JOB_INPUTS.transcription.safeParse({ file: "/api/v1/uploads/../../other-ws/x.wav" }).success);
  });

  it("maps media references only inside the job's own workspace (no traversal)", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    assert.equal(storageKeyFor("ws-a", `/api/v1/uploads/${id}.wav`), `ws-a/uploads/${id}.wav`);
    assert.equal(storageKeyFor("ws-a", `/api/v1/generated/${id}-output.mp3`), `ws-a/generated/${id}-output.mp3`);
    assert.throws(() => storageKeyFor("ws-a", "/api/v1/uploads/../ws-b/x.wav"), PermanentJobError);
    assert.throws(() => storageKeyFor("ws-a", "ws-b/uploads/x.wav"), PermanentJobError);
  });

  it("fails malformed jobs permanently and unconfigured providers with the boundary", async () => {
    withEnv({});
    await assert.rejects(executeJob(job("generation", { kind: "image" }), async () => {}), PermanentJobError);
    await assert.rejects(executeJob(job("audio", { kind: "tts", text: "" }), async () => {}), PermanentJobError);
    await assert.rejects(executeJob(job("generation", { kind: "image", prompt: "x" }), async () => {}), ProviderNotConfiguredError);
    await assert.rejects(executeJob(job("render", { composition: {} }), async () => {}), ProviderNotConfiguredError);
  });

  it("leaves non-media strings in compositions untouched", async () => {
    const out = await signCompositionMedia("ws-a", { name: "x", clips: [{ src: "https://cdn.example/a.png", n: 2 }] });
    assert.deepEqual(out, { name: "x", clips: [{ src: "https://cdn.example/a.png", n: 2 }] });
  });
});

describe("captions from transcription", () => {
  it("offsets segments to the voice clip and drops empty ones", () => {
    const clips = captionsFromSegments(
      [
        { startSec: 0, endSec: 1.5, text: "Hello there." },
        { startSec: 1.5, endSec: 1.5, text: "zero" },
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

describe("environment aliases", () => {
  it("accepts SUPABASE_DB_URL / NEXT_PUBLIC_SUPABASE_URL and never reads secrets from NEXT_PUBLIC_*", async () => {
    const { getServerEnv } = await import("@/src/lib/env");
    const env = getServerEnv({
      SUPABASE_DB_URL: "postgres://u:p@db.example:6543/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "leak",
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(env.DATABASE_URL, "postgres://u:p@db.example:6543/postgres");
    assert.equal(env.SUPABASE_URL, "https://x.supabase.co");
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  });
});
