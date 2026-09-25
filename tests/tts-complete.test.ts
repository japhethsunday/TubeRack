import { test } from "node:test";
import assert from "node:assert/strict";
import { completeSpeech } from "@/src/server/ai/gemini";

test("speech: a voice engine that stops early gets re-run on smaller pieces until every word is voiced", async () => {
  const rate = 1000;
  // Fake engine: speaks 3 words/sec but never more than 20 seconds per request.
  const engine = async (t: string) => {
    const words = t.split(/\s+/).filter(Boolean).length;
    const sec = Math.min(words / 3, 20);
    return { pcm: Buffer.alloc(Math.round(sec * rate) * 2), rate };
  };
  const text = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} of the script today.`).join(" ");
  const parts = await completeSpeech(text, engine);
  const total = parts.reduce((n, p) => n + p.pcm.length / 2 / p.rate, 0);
  const words = text.split(/\s+/).length;
  assert.ok(total >= (words / 3) * 0.95, `voiced ${total.toFixed(0)}s of ${(words / 3).toFixed(0)}s`);
});
