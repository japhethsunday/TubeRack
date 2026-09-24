import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitForSpeech } from "@/src/server/ai/gemini";

const words = (t: string) => t.split(/\s+/).filter(Boolean);

describe("splitForSpeech", () => {
  it("keeps short text in one chunk", () => {
    assert.deepEqual(splitForSpeech("Hello there. How are you?"), ["Hello there. How are you?"]);
  });

  it("splits a long script at sentence breaks without losing or reordering any word", () => {
    const para = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} explains one idea clearly and moves on!`).join(" ");
    const script = [para, para, para].join("\n\n");
    const chunks = splitForSpeech(script, 400);
    assert.ok(chunks.length > 5);
    for (const c of chunks) assert.ok(c.length <= 400, `chunk too long: ${c.length}`);
    for (const c of chunks) assert.match(c, /[.!?]$/);
    assert.deepEqual(words(chunks.join(" ")), words(script));
  });

  it("breaks an over-long sentence at word boundaries", () => {
    const run = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitForSpeech(run, 200);
    for (const c of chunks) assert.ok(c.length <= 200);
    assert.deepEqual(words(chunks.join(" ")), words(run));
  });
});
