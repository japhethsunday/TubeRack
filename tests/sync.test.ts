import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage for the merge bookkeeping.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const { mergeById, mergeMaps, rememberSynced, clearSyncedMarks, stampOf } = await import("@/src/lib/sync");

const item = (id: string, updatedAt: string, v = id) => ({ id, updatedAt, v });

describe("device ↔ account merge", () => {
  beforeEach(() => store.clear());

  it("keeps unsynced local items instead of discarding them", () => {
    const out = mergeById([item("new", "2026-01-02")], [item("a", "2026-01-01")], "t.x");
    assert.deepEqual(out.map((i) => i.id).sort(), ["a", "new"]);
  });

  it("newest edit wins in both directions", () => {
    const local = [item("a", "2026-01-05", "local-newer"), item("b", "2026-01-01", "local-older")];
    const remote = [item("a", "2026-01-02", "remote-older"), item("b", "2026-01-03", "remote-newer")];
    const out = Object.fromEntries(mergeById(local, remote, "t.x").map((i) => [i.id, i.v]));
    assert.deepEqual(out, { a: "local-newer", b: "remote-newer" });
  });

  it("drops local items that were synced before and deleted on another device", () => {
    rememberSynced("t.x", ["gone"]);
    const out = mergeById([item("gone", "2026-01-01"), item("fresh", "2026-01-01")], [], "t.x");
    assert.deepEqual(out.map((i) => i.id), ["fresh"]);
  });

  it("remembers server ids after a merge and resets on account switch", () => {
    mergeById([], [item("s", "2026-01-01")], "t.x");
    assert.deepEqual(mergeById([item("s", "2026-01-01")], [], "t.x"), []);
    clearSyncedMarks();
    assert.equal(mergeById([item("s", "2026-01-01")], [], "t.x").length, 1);
  });

  it("merges id-keyed maps the same way", () => {
    rememberSynced("t.m", ["old"]);
    const out = mergeMaps({ keep: { updatedAt: "2026-01-09" }, old: { updatedAt: "2026-01-01" }, both: { updatedAt: "2026-01-09" } }, { both: { updatedAt: "2026-01-01" } }, "t.m");
    assert.deepEqual(Object.keys(out).sort(), ["both", "keep"]);
    assert.equal(out.both.updatedAt, "2026-01-09");
    assert.equal(stampOf({ at: "2026-01-01T00:00:00Z" }), Date.parse("2026-01-01T00:00:00Z"));
  });
});
