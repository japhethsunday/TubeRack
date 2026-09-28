/**
 * "Fast start" for MP4: when the index (moov) sits after the media data
 * (mdat), a player must download the whole file before the first frame.
 * Moving moov to the front (and shifting the chunk offsets it holds) lets
 * playback start after the first few hundred KB. Returns the input unchanged
 * when it's already fast-start or can't be parsed safely.
 */

interface Box { type: string; start: number; size: number; header: number }

function topLevel(buf: Uint8Array): Box[] | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Box[] = [];
  let off = 0;
  while (off + 8 <= buf.byteLength) {
    let size = v.getUint32(off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    let header = 8;
    if (size === 1) {
      if (off + 16 > buf.byteLength) return null;
      const big = v.getBigUint64(off + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(big);
      header = 16;
    } else if (size === 0) size = buf.byteLength - off;
    if (size < header || off + size > buf.byteLength) return null;
    out.push({ type, start: off, size, header });
    off += size;
  }
  return off === buf.byteLength ? out : null;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "mvex"]);

/** Add `delta` to every chunk offset (stco / co64) inside a moov box, in place. Returns false if an offset would overflow. */
function shiftOffsets(moov: Uint8Array, delta: number): boolean {
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const walk = (start: number, end: number): boolean => {
    let off = start;
    while (off + 8 <= end) {
      const size = v.getUint32(off);
      const type = String.fromCharCode(moov[off + 4], moov[off + 5], moov[off + 6], moov[off + 7]);
      if (size < 8 || off + size > end) return false;
      if (CONTAINERS.has(type)) {
        if (!walk(off + 8, off + size)) return false;
      } else if (type === "stco") {
        const n = v.getUint32(off + 12);
        for (let i = 0; i < n; i++) {
          const p = off + 16 + i * 4;
          const next = v.getUint32(p) + delta;
          if (next > 0xffffffff || next < 0) return false;
          v.setUint32(p, next);
        }
      } else if (type === "co64") {
        const n = v.getUint32(off + 12);
        for (let i = 0; i < n; i++) {
          const p = off + 16 + i * 8;
          v.setBigUint64(p, v.getBigUint64(p) + BigInt(delta));
        }
      }
      off += size;
    }
    return true;
  };
  return walk(8, moov.byteLength);
}

export function fastStart(input: Uint8Array): Uint8Array {
  const boxes = topLevel(input);
  if (!boxes) return input;
  const moovI = boxes.findIndex((b) => b.type === "moov");
  const mdatI = boxes.findIndex((b) => b.type === "mdat");
  if (moovI < 0 || mdatI < 0 || moovI < mdatI || boxes[moovI].header !== 8) return input; // already fast-start (or unusual)
  const moovBox = boxes[moovI];
  const moov = input.slice(moovBox.start, moovBox.start + moovBox.size);
  // Everything before mdat moves right by moov's size; nothing else moves.
  if (!shiftOffsets(moov, moovBox.size)) return input;
  const out = new Uint8Array(input.byteLength);
  let at = 0;
  const firstMedia = boxes[mdatI].start;
  out.set(input.subarray(0, firstMedia), 0); // ftyp (+ anything before the media)
  at = firstMedia;
  out.set(moov, at);
  at += moov.byteLength;
  for (let i = mdatI; i < boxes.length; i++) {
    if (i === moovI) continue;
    const b = boxes[i];
    out.set(input.subarray(b.start, b.start + b.size), at);
    at += b.size;
  }
  return at === input.byteLength ? out : input;
}
