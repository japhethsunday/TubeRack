import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonObject } from "@/src/server/admin-ai";

describe("admin AI drafts", () => {
  it("reads JSON drafts even when wrapped in code fences or prose", () => {
    assert.deepEqual(parseJsonObject('```json\n{"name":"Ada","message":"Hello"}\n```'), { name: "Ada", message: "Hello" });
    assert.deepEqual(parseJsonObject('Here you go: {"message":"Hi"} thanks'), { message: "Hi" });
  });
  it("rejects unreadable drafts with a clear error", () => {
    assert.throws(() => parseJsonObject("no json here"), /unreadable draft/);
    assert.throws(() => parseJsonObject("{not: valid}"), /unreadable draft/);
  });
});
