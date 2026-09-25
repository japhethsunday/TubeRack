import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeThumbnail, solidBase } from "@/src/lib/package/thumbnails";

describe("composeThumbnail", () => {
  it("never repeats an attribute on the nested base (keeps the SVG valid as a file or image)", () => {
    const svg = composeThumbnail(solidBase("#111111", "#222222"), [{ id: "a", text: "HELLO & <WORLD>", x: 6, y: 30, size: 100, color: "#fff", weight: 900, align: "left" }]);
    for (const tag of svg.match(/<svg\b[^>]*>/g) ?? []) {
      const names = [...tag.matchAll(/\s([\w:-]+)="/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `duplicate attribute in ${tag}`);
    }
    assert.ok(svg.includes("HELLO &amp; &lt;WORLD&gt;"));
  });
});
