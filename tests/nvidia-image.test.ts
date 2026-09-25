import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractImage } from "@/src/server/ai/nvidia-image";

describe("nvidia image replies", () => {
  it("reads the image from each reply shape", () => {
    assert.equal(extractImage({ artifacts: [{ base64: "AAA", finishReason: "SUCCESS" }] }), "AAA");
    assert.equal(extractImage({ image: "data:image/jpeg;base64,BBB" }), "BBB");
    assert.equal(extractImage({ data: [{ b64_json: "CCC" }] }), "CCC");
  });
  it("treats a filtered image as no image", () => {
    assert.equal(extractImage({ artifacts: [{ base64: "AAA", finishReason: "CONTENT_FILTERED" }] }), null);
    assert.equal(extractImage({}), null);
  });
});
