import { test } from "node:test";
import assert from "node:assert/strict";
import { HF_TEXT_MODELS, isHuggingFaceConfigured } from "@/src/server/ai/huggingface";

test("hugging face: a chain of distinct open models, on only with a token", () => {
  assert.ok(HF_TEXT_MODELS.length >= 5);
  assert.equal(new Set(HF_TEXT_MODELS).size, HF_TEXT_MODELS.length);
  assert.equal(isHuggingFaceConfigured({ HF_TOKEN: "hf_x" } as never), true);
  assert.equal(isHuggingFaceConfigured({ HF_TOKEN: " " } as never), false);
  assert.equal(isHuggingFaceConfigured({} as never), false);
});
