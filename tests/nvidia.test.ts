import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { nvidiaGenerateText, stripThinking } from "@/src/server/ai/nvidia";
import { GeminiTextProvider } from "@/src/server/ai/gemini";

const realFetch = globalThis.fetch;
const saved = { ...process.env };

function useEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetEnvCache();
}

/** Fake NVIDIA API: a model list plus per-model chat behaviour. */
function fakeNvidia(live: string[], chat: Record<string, () => Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) return Response.json({ data: live.map((id) => ({ id })) });
    const model = JSON.parse(String(init?.body)).model as string;
    calls.push(model);
    return (chat[model] ?? (() => new Response("not found", { status: 404 })))();
  }) as typeof fetch;
  return calls;
}

const reply = (content: string) => () => Response.json({ choices: [{ message: { content } }] });

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
  __resetEnvCache();
});

describe("nvidia models", () => {
  it("strips reasoning blocks", () => {
    assert.equal(stripThinking("<think>plan…</think>\nFinal answer"), "Final answer");
  });

  it("skips models not in the live catalog and moves past a busy one", async () => {
    useEnv({ NVIDIA_API_KEY: "test", NVIDIA_TEXT_MODELS: "a/gone,b/busy,c/good,d/unused" });
    const calls = fakeNvidia(["b/busy", "c/good", "d/unused"], {
      "b/busy": () => new Response("overloaded", { status: 503 }),
      "c/good": reply("<think>x</think>Hello from C"),
    });
    const out = await nvidiaGenerateText({ prompt: "hi" });
    assert.deepEqual(out, { text: "Hello from C", model: "c/good" });
    assert.deepEqual(calls, ["b/busy", "c/good"]);
  });

  it("rejects unreadable JSON and uses the next model", async () => {
    useEnv({ NVIDIA_API_KEY: "test2", NVIDIA_TEXT_MODELS: "x/prose,y/json" });
    fakeNvidia(["x/prose", "y/json"], { "x/prose": reply("Sure! Here you go."), "y/json": reply('{"ok":true}') });
    const out = await nvidiaGenerateText({ prompt: "give json", json: true });
    assert.equal(out.model, "y/json");
  });

  it("powers text on its own when only NVIDIA is configured", async () => {
    useEnv({ GEMINI_API_KEY: undefined, NVIDIA_API_KEY: "test3", NVIDIA_TEXT_MODELS: "m/one" });
    fakeNvidia(["m/one"], { "m/one": reply("Script text") });
    const out = await new GeminiTextProvider().generateText({ prompt: "write" });
    assert.deepEqual(out, { text: "Script text", model: "m/one" });
  });
});
