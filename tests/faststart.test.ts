import { test } from "node:test";
import assert from "node:assert/strict";
import { fastStart } from "@/src/server/media/faststart";

const box = (type: string, body: Uint8Array) => {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(body, 8);
  return out;
};
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const stco = (offset: number) => {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setUint32(4, 1);
  v.setUint32(8, offset);
  return box("stco", b);
};
const moovWith = (offset: number) => box("moov", box("trak", box("mdia", box("minf", box("stbl", stco(offset))))));

test("moves the index in front of the media and fixes chunk offsets", () => {
  const ftyp = box("ftyp", new Uint8Array(8));
  const mdat = box("mdat", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  const slow = cat(ftyp, mdat, moovWith(ftyp.length + 8)); // data starts right after mdat's header
  const fast = fastStart(slow);
  const moovLen = moovWith(0).length;
  assert.equal(String.fromCharCode(...fast.slice(ftyp.length + 4, ftyp.length + 8)), "moov");
  const offset = new DataView(fast.buffer).getUint32(ftyp.length + moovLen - 4);
  assert.equal(offset, ftyp.length + moovLen + 8);
  assert.deepEqual([...fast.slice(offset, offset + 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("leaves fast-start and unreadable files untouched", () => {
  const ftyp = box("ftyp", new Uint8Array(8));
  const good = cat(ftyp, moovWith(100), box("mdat", new Uint8Array(4)));
  assert.equal(fastStart(good), good);
  const junk = new Uint8Array([0, 0, 0, 3, 1, 2]);
  assert.equal(fastStart(junk), junk);
});
