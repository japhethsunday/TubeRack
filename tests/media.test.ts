import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPoster, seedFromText, mulberry32, POSTER_DIMS, POSTER_STYLES, styleById } from "@/src/lib/media/svg";
import { validateUpload, UPLOAD_LIMITS } from "@/src/lib/media/validation";
import { buildVisualPrompt, promptToText, PROMPT_METHOD } from "@/src/lib/media/prompts";
import { providerById, capabilityBlock, PROVIDERS } from "@/src/lib/media/providers";
import { musicRecipe, progressionFor, noteFrequency, sfxRecipe, MUSIC_MOODS, SFX_TYPES } from "@/src/lib/media/audio";
import { emptyMediaBundle, parseMediaBundle } from "@/src/lib/media/storage";
import { runLocalJob } from "@/src/components/media/MediaProvider";
import type { MediaStatus } from "@/src/lib/media/types";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe("svg drafts", () => {
  it("renders deterministically with correct dims and escaped titles", () => {
    const a = buildPoster({ seed: 42, title: "Hooks <b>& co", styleId: "neon", aspect: "16:9" });
    const b = buildPoster({ seed: 42, title: "Hooks <b>& co", styleId: "neon", aspect: "16:9" });
    assert.equal(a, b);
    assert.ok(!a.includes("<b>") && a.includes("&lt;b&gt;") && a.includes("&amp;"));
    assert.ok(a.includes('width="960"') && a.includes('SEED 42'));
    const other = buildPoster({ seed: 43, title: "Hooks", styleId: "neon", aspect: "16:9" });
    assert.notEqual(a, other);
    assert.deepEqual(POSTER_DIMS["9:16"], { width: 540, height: 960 });
    assert.equal(POSTER_STYLES.length, 6);
    assert.equal(styleById("nope").id, "neon");
    assert.equal(seedFromText("abc"), seedFromText("abc"));
    const r1 = mulberry32(7)();
    assert.ok(r1 >= 0 && r1 < 1);
  });
});

describe("upload validation", () => {
  it("sniffs content including RIFF disambiguation, enforces caps", () => {
    assert.deepEqual(validateUpload(png, 100), { kind: "image", mime: "image/png" });
    assert.deepEqual(validateUpload(jpg, 100), { kind: "image", mime: "image/jpeg" });
    assert.deepEqual(validateUpload(mp4, 100), { kind: "video", mime: "video/mp4" });
    assert.deepEqual(validateUpload(mp3, 100), { kind: "audio", mime: "audio/mpeg" });
    assert.deepEqual(validateUpload(wav, 100), { kind: "audio", mime: "audio/wav" });
    assert.deepEqual(validateUpload(webp, 100), { kind: "image", mime: "image/webp" });
    assert.throws(() => validateUpload(garbage, 100), /Unrecognized/);
    assert.throws(() => validateUpload(png, 0), /empty|large/i);
    assert.throws(() => validateUpload(png, UPLOAD_LIMITS.image.bytes + 1), /too large/);
  });
});

describe("prompt assistant", () => {
  it("assembles structured, editable sections from scene + DNA", () => {
    const sections = buildVisualPrompt({
      sceneTitle: "Hook",
      scriptExcerpt: "Payoff first",
      visualDirection: "Neon desk",
      tone: "Direct",
      positioning: "Tested tactics",
      avoidStyles: "Clutter",
      visualStyle: "Cinematic",
      colorDirection: "Warm",
      platform: "TikTok",
      instruction: "Headroom for captions",
    });
    const labels = sections.map((s) => s.label);
    for (const need of ["Subject", "Environment", "Composition", "Camera", "Lighting", "Style", "Motion", "Mood", "Aspect ratio", "Avoid", "Creator instruction"]) {
      assert.ok(labels.includes(need), need);
    }
    assert.ok(sections.find((s) => s.label === "Aspect ratio")?.text.includes("9:16"));
    assert.ok(promptToText(sections).includes("Subject:"));
    assert.ok(PROMPT_METHOD.includes("no AI provider"));
  });
});

describe("provider capabilities", () => {
  it("gates operations with reasons, never silent controls", () => {
    assert.equal(PROVIDERS.length, 2);
    assert.equal(capabilityBlock("on-device", "image"), null);
    assert.equal(capabilityBlock("on-device", "tts"), null);
    assert.ok((capabilityBlock("on-device", "video") ?? "").length > 0);
    assert.ok((capabilityBlock("on-device", "reference") ?? "").length > 0);
    assert.equal(capabilityBlock("ai-provider", "image"), null);
    assert.equal(capabilityBlock("ai-provider", "tts"), null);
    assert.ok((capabilityBlock("ai-provider", "video") ?? "").length > 0);
    assert.equal(providerById("unknown").id, "on-device");
  });
});

describe("audio composition", () => {
  it("derives deterministic recipes and frequencies", () => {
    assert.equal(MUSIC_MOODS.length, 9);
    assert.equal(SFX_TYPES.length, 8);
    const recipe = musicRecipe("Ambient", 120);
    assert.equal(recipe.seconds, 60);
    assert.equal(musicRecipe("Energetic", 2).seconds, 4);
    assert.deepEqual(progressionFor("major"), [0, -4, 3, -2]);
    assert.equal(noteFrequency(440, 12), 880);
    assert.equal(sfxRecipe("Whoosh").seconds, 0.8);
  });
});

describe("media storage", () => {
  it("round-trips bundles and rejects garbage", () => {
    const bundle = emptyMediaBundle();
    assert.deepEqual(parseMediaBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parseMediaBundle({}), /media file/);
    assert.throws(() => parseMediaBundle({ version: 1, assets: [{ id: 1 }], voices: [], consistency: [] }), /media file/);
  });
});

describe("local job runner", () => {
  it("sequences statuses and honors cancellation", async () => {
    const seen: MediaStatus[] = [];
    const ok = await runLocalJob(
      (s) => seen.push(s),
      [{ label: "a", work: () => undefined }, { label: "b", work: () => undefined }],
      () => false,
    );
    assert.equal(ok, true);
    assert.deepEqual(seen, ["pending", "preparing", "ready"]);

    const seen2: MediaStatus[] = [];
    const ok2 = await runLocalJob(
      (s) => seen2.push(s),
      [{ label: "a", work: () => undefined }, { label: "b", work: () => undefined }],
      () => true,
    );
    assert.equal(ok2, false);
    assert.ok(seen2.includes("cancelled"));
  });
});
