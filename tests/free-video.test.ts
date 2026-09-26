import { test } from "node:test";
import assert from "node:assert/strict";
import { FREE_VIDEO_ENGINES, isFreeVideoConfigured, parseEventStream, videoUrlFrom } from "@/src/server/ai/free-video";

const base = "https://x.hf.space";

test("free video: reads a completed job and its video file", () => {
  const done = parseEventStream('event: generating\ndata: null\n\nevent: complete\ndata: [{"video":{"path":"/tmp/a.mp4","url":"https://x.hf.space/f/a.mp4"}},42]\n');
  assert.equal(done.done, true);
  assert.equal(videoUrlFrom(base, done.done ? done.data : null), "https://x.hf.space/f/a.mp4");
  assert.equal(videoUrlFrom(base, [{ path: "/tmp/b.mp4" }, 1]), `${base}/gradio_api/file=/tmp/b.mp4`);
  assert.equal(videoUrlFrom(base, [null]), null);
});

test("free video: reports failures and quota errors", () => {
  assert.deepEqual(parseEventStream("event: error\ndata: null\n"), { done: false, error: "busy" });
  const quota = parseEventStream('event: error\ndata: "You have exceeded your GPU quota"\n');
  assert.equal(quota.done, false);
  assert.match(quota.done ? "" : String(quota.error), /quota/);
  assert.deepEqual(parseEventStream(""), { done: false, error: null });
});

test("free video: text needs a text engine, images can use every engine", () => {
  const text = { prompt: "city", image: null, aspect: "16:9" as const, seconds: 3 };
  assert.deepEqual(FREE_VIDEO_ENGINES.filter((e) => e.call(text, null)).map((e) => e.id), ["ltx"]);
  const file = { path: "/tmp/i.png", meta: { _type: "gradio.FileData" as const } };
  const img = { ...text, image: { bytes: new Uint8Array(1), mime: "image/png" } };
  assert.equal(FREE_VIDEO_ENGINES.filter((e) => e.call(img, file)).length, 2);
  assert.equal(isFreeVideoConfigured({}), true);
  assert.equal(isFreeVideoConfigured({ FREE_VIDEO: "off" }), false);
});
