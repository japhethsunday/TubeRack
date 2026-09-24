import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJson, serializeJson } from "@/src/server/json-type";

describe("postgres json type", () => {
  it("does not double-encode pre-serialized JSON", () => {
    const text = JSON.stringify({ idea: "in-progress" });
    assert.equal(serializeJson(text), text);
    assert.equal(serializeJson({ idea: "in-progress" }), text);
    assert.equal(serializeJson([1, 2]), "[1,2]");
  });
  it("still encodes plain strings and scalars", () => {
    assert.equal(serializeJson("hello"), '"hello"');
    assert.equal(serializeJson(3), "3");
    assert.equal(serializeJson({ a: undefined }), '{"a":null}');
  });
  it("unwraps double-encoded rows on read", () => {
    const stored = JSON.stringify(JSON.stringify({ idea: "in-progress" }));
    assert.deepEqual(parseJson(stored), { idea: "in-progress" });
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
    assert.equal(parseJson('"plain"'), "plain");
  });
});
