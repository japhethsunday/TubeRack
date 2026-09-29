import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { lenientParse } from "../src/lib/lenient";

const schema = z.object({
  version: z.literal(1),
  items: z.array(z.object({ id: z.string(), n: z.number() })),
  byKey: z.record(z.string(), z.object({ id: z.string() })),
});

describe("lenient bundle parsing", () => {
  it("keeps every valid item and drops only the bad ones", () => {
    const out = lenientParse<z.infer<typeof schema>>(schema, { version: 1, items: [{ id: "a", n: 1 }, { id: 2 }], byKey: { x: { id: "x" }, y: { nope: 1 } } }, "test");
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.deepEqual(out.data.items, [{ id: "a", n: 1 }]);
      assert.deepEqual(Object.keys(out.data.byKey), ["x"]);
      assert.equal(out.dropped, 2);
    }
  });
  it("still rejects data that isn't a bundle at all", () => {
    assert.equal(lenientParse(schema, { version: 2, items: [], byKey: {} }, "test").ok, false);
    assert.equal(lenientParse(schema, "garbage", "test").ok, false);
  });
});
