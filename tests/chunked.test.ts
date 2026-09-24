import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkedParts, partCount, PART_BYTES } from "@/src/lib/media/chunked";

describe("chunked uploads", () => {
  const base = "/api/v1/uploads/0f8fad5b-d9cb-469f-a165-70867728950e.mp4";
  it("counts parts", () => {
    assert.equal(partCount(10), 1);
    assert.equal(partCount(PART_BYTES), 1);
    assert.equal(partCount(PART_BYTES + 1), 2);
  });
  it("expands a chunked payload into part urls", () => {
    assert.deepEqual(chunkedParts(`${base}?parts=3`), [`${base}.part0`, `${base}.part1`, `${base}.part2`]);
  });
  it("rejects single files and malformed payloads", () => {
    assert.equal(chunkedParts(base), null);
    assert.equal(chunkedParts(`${base}?parts=1`), null);
    assert.equal(chunkedParts(`/api/v1/uploads/../x.mp4?parts=3`), null);
    assert.equal(chunkedParts(`https://evil.test${base}?parts=3`), null);
  });
});
