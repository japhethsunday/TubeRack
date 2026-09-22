import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetEnvCache } from "@/src/lib/env";
import {
  fetchChannelSnapshot,
  fetchVideoResearch,
  fetchVideoSnapshot,
  isYouTubeConfigured,
} from "@/src/server/youtube/client";

/** Hermetic: stubbed fetch — no network, no quota spent. */
describe("youtube client", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.YOUTUBE_API_KEY;
    __resetEnvCache();
  });

  it("serves keyless oEmbed when no key is set (degraded, honest provenance)", async () => {
    delete process.env.YOUTUBE_API_KEY;
    __resetEnvCache();
    assert.equal(isYouTubeConfigured(), false);
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      assert.ok(url.includes("oembed"), `expected oEmbed call, got ${url}`);
      return new Response(JSON.stringify({ title: "Big Buck Bunny", author_name: "Blender" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const snap = await fetchVideoSnapshot("aqz-KE-bpKQ");
    assert.equal(snap.title, "Big Buck Bunny");
    assert.deepEqual(snap.metrics, {});
    assert.equal(snap.metricsProvenance, "youtube-oembed");
    assert.equal(snap.degraded, true);
  });

  it("falls back to oEmbed when the Data API rejects the key (403)", async () => {
    process.env.YOUTUBE_API_KEY = "restricted-key";
    __resetEnvCache();
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("googleapis.com")) {
        return new Response(JSON.stringify({ error: { message: "Blocked.", errors: [{ reason: "forbidden" }] } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ title: "Big Buck Bunny", author_name: "Blender" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const snap = await fetchVideoSnapshot("aqz-KE-bpKQ");
    assert.equal(snap.title, "Big Buck Bunny");
    assert.equal(snap.degraded, true);
    assert.equal(snap.metricsProvenance, "youtube-oembed");
  });

  it("rejects malformed ids before any network", async () => {
    process.env.YOUTUBE_API_KEY = "test-key-not-a-secret";
    __resetEnvCache();
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("must not fetch");
    }) as typeof fetch;
    await assert.rejects(() => fetchVideoSnapshot("nope"), /invalid video id/);
    await assert.rejects(() => fetchChannelSnapshot("short"), /invalid channel id/);
    assert.equal(called, false);
  });

  it("maps video snippet+statistics to a provenanced snapshot", async () => {
    process.env.YOUTUBE_API_KEY = "test-key-not-a-secret";
    __resetEnvCache();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              snippet: { title: "Big Buck Bunny", publishedAt: "2008-04-10T00:00:00Z", tags: ["bunny"] },
              statistics: { viewCount: "1000", likeCount: "50", commentCount: "5" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const snap = await fetchVideoSnapshot("aqz-KE-bpKQ");
    assert.equal(snap.kind, "video");
    assert.equal(snap.externalId, "aqz-KE-bpKQ");
    assert.equal(snap.title, "Big Buck Bunny");
    assert.deepEqual(snap.metrics, { views: 1000, likes: 50, comments: 5 });
    assert.equal(snap.metricsProvenance, "youtube-data-api-v3");
  });

  it("maps videos to research sources without fabricating", async () => {
    process.env.YOUTUBE_API_KEY = "test-key-not-a-secret";
    __resetEnvCache();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              snippet: {
                title: "Big Buck Bunny",
                description: "A giant rabbit short.",
                publishedAt: "2008-04-10T00:00:00Z",
                tags: ["bunny", "short"],
              },
              statistics: { viewCount: "1000" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const source = await fetchVideoResearch("aqz-KE-bpKQ");
    assert.equal(source.id, "yt-aqz-KE-bpKQ");
    assert.equal(source.url, "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    assert.equal(source.credibility, "high");
    assert.ok(source.facts.length > 0);
  });

  it("fails closed and never leaks the key when every source fails", async () => {
    process.env.YOUTUBE_API_KEY = "super-secret-key-value";
    __resetEnvCache();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "API key not valid.", errors: [{ reason: "keyInvalid" }] } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const err = await fetchVideoSnapshot("aqz-KE-bpKQ").catch((e: Error) => e);
    assert.ok(err instanceof Error);
    assert.ok(!err.message.includes("super-secret-key-value"));
    assert.ok(err.message.includes("unavailable"));
  });
});
