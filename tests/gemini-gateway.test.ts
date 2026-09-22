import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import { createGateway } from "@/src/lib/ai-gateway/registry";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import {
  currentGeminiModel,
  getGeminiClient,
  getGeminiModels,
  isGeminiConfigured,
  registerGeminiProviders,
} from "@/src/server/ai/gemini";

/** Hermetic: construction/registration only — no network calls. */
describe("gemini provider", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    __resetEnvCache();
  });

  it("stays unconfigured without a key (honest boundary, no client built)", () => {
    delete process.env.GEMINI_API_KEY;
    __resetEnvCache();
    assert.equal(isGeminiConfigured(), false);
    assert.equal(currentGeminiModel(), null);
    assert.throws(() => getGeminiClient(), ProviderNotConfiguredError);
    const gateway = createGateway();
    assert.deepEqual(registerGeminiProviders(gateway), []);
    assert.equal(gateway.has("text"), false);
    assert.equal(gateway.has("image"), false);
    assert.equal(gateway.has("tts"), false);
  });

  it("registers gemini for text, image, and tts with a key (no network)", () => {
    process.env.GEMINI_API_KEY = "test-key-not-a-secret";
    __resetEnvCache();
    assert.equal(isGeminiConfigured(), true);
    assert.deepEqual(currentGeminiModel(), { provider: "gemini", model: "gemini-3.6-flash" });
    assert.deepEqual(getGeminiModels(), {
      text: "gemini-3.6-flash",
      image: "gemini-3.1-flash-image",
      tts: "gemini-2.5-flash-preview-tts",
      voice: "Kore",
    });
    assert.ok(getGeminiClient());
    const gateway = createGateway();
    assert.deepEqual(registerGeminiProviders(gateway), ["text", "image", "tts"]);
    assert.equal(gateway.resolve("text").name, "gemini");
    assert.equal(gateway.resolve("image").name, "gemini");
    assert.equal(gateway.resolve("tts").name, "gemini");
  });
});
