import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSuggestions } from "@/src/server/growth/search-demand";

describe("YouTube search demand", () => {
  it("keeps real 'how to' searches and drops junk", () => {
    const body = ["how to grow on tiktok", ["How to grow on TikTok fast", "how", "tiktok songs", "how to grow on tiktok 2026 <script>", "how to post on tiktok without losing quality"]];
    assert.deepEqual(parseSuggestions(body), ["how to grow on tiktok fast", "how to post on tiktok without losing quality"]);
  });
  it("returns nothing for unexpected replies", () => {
    assert.deepEqual(parseSuggestions(null), []);
    assert.deepEqual(parseSuggestions({ a: 1 }), []);
    assert.deepEqual(parseSuggestions(["q", "not a list"]), []);
  });
});
