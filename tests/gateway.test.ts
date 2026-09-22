import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createGateway,
  getGateway,
} from "@/src/lib/ai-gateway/registry";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import type { TextProvider } from "@/src/lib/ai-gateway/types";

const stubText: TextProvider = {
  capability: "text",
  name: "stub-text",
  async generateText() {
    return { text: "stub", model: "stub" };
  },
};

describe("ai gateway registry", () => {
  it("throws a boundary error for unconfigured capabilities (no fakes)", async () => {
    const gw = createGateway();
    assert.equal(gw.has("text"), false);
    assert.throws(() => gw.resolve("text"), ProviderNotConfiguredError);
  });

  it("resolves registered providers by capability", () => {
    const gw = createGateway();
    gw.register(stubText);
    assert.equal(gw.has("text"), true);
    assert.deepEqual(gw.configuredCapabilities(), ["text"]);
    assert.equal(gw.resolve("text").name, "stub-text");
  });

  it("exposes a shared server instance", () => {
    assert.ok(getGateway());
  });
});
