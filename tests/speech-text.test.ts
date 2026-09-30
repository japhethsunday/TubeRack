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

test("voice quota: wait on per-minute limits, not on daily or blocked ones", async () => {
  const { quotaRetryMs } = await import("@/src/server/ai/gemini");
  const perMinute = new Error('{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 10, model: gemini-2.5-flash-tts\\nPlease retry in 47.612534442s.","status":"RESOURCE_EXHAUSTED"}}');
  assert.equal(quotaRetryMs(perMinute), 49113);
  assert.equal(quotaRetryMs(new Error("429 RESOURCE_EXHAUSTED limit: 0, model: x. Please retry in 5s.")), null);
  assert.equal(quotaRetryMs(new Error("429 quota GenerateRequestsPerDayPerProjectPerModel retry in 5s")), null);
  assert.equal(quotaRetryMs(new Error("503 overloaded")), null);
  assert.equal(quotaRetryMs(new Error("429 RESOURCE_EXHAUSTED Please retry in 992.43535ms.")), 2493);
});
