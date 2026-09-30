import { test } from "node:test";
import assert from "node:assert/strict";
import { directSpeech, speakable } from "@/src/server/ai/gemini";

test("speakable strips things a person wouldn't say", () => {
  const out = speakable("**Stop** wasting money 💸 — here's how! [B-roll: wallet] (pause) Visit https://x.co #money\n\n\nReady...");
  assert.equal(out, "Stop wasting money, here's how! Visit money\n\nReady…");
});

test("keeps normal narration unchanged", () => {
  const t = "Most people never check their bank fees. Here are three that cost you money every month.";
  assert.equal(speakable(t), t);
});

test("direction wraps the text and asks for a human delivery", () => {
  const d = directSpeech("Hello there.", "storyteller");
  assert.match(d, /storyteller/);
  assert.match(d, /not an AI/);
  assert.ok(d.endsWith(":\nHello there."));
});
