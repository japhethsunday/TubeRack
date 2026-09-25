"use client";

import { chunkedParts, downloadChunked } from "@/src/lib/media/chunked";
import type { RenderAsset } from "@/src/lib/video/render";

/**
 * Load the audio an export needs from one asset. Reads the device copy first,
 * then the cloud file (single or multi-part), retrying once. Long files are
 * cut to the part the timeline actually uses before decoding: a two-hour song
 * under a three-minute video would otherwise decode to gigabytes and fail.
 */

export interface LoadedAudio {
  buffer: AudioBuffer;
  /** Source time (seconds) that the buffer's first sample corresponds to. */
  startSec: number;
}

/** Decoding more than this much audio at once risks running out of memory. */
const MAX_DECODE_SEC = 20 * 60;

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      return await res.arrayBuffer();
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last instanceof Error ? last : new Error("download failed");
}

async function bytesFor(a: RenderAsset): Promise<ArrayBuffer> {
  if (a.blobUrl) {
    try {
      return await fetchBytes(a.blobUrl);
    } catch {
      // fall through to the cloud copy
    }
  }
  if (a.source === "provider-output" && a.payload) {
    if (chunkedParts(a.payload)) return (await downloadChunked(a.payload, a.mime)).arrayBuffer();
    if (/^(https?:|\/|data:)/.test(a.payload)) return fetchBytes(a.payload);
  }
  throw new Error(a.source === "upload-session" ? "the file isn't on this device yet — open it once in Media to download it" : "no stored file");
}

/** Parse a PCM WAV header: where samples start and how many bytes per second. */
function wavInfo(bytes: ArrayBuffer): { dataStart: number; dataLen: number; byteRate: number; blockAlign: number; headerEnd: number } | null {
  const v = new DataView(bytes);
  if (bytes.byteLength < 44 || v.getUint32(0, false) !== 0x52494646 || v.getUint32(8, false) !== 0x57415645) return null;
  let off = 12;
  let byteRate = 0;
  let blockAlign = 0;
  while (off + 8 <= bytes.byteLength) {
    const id = v.getUint32(off, false);
    const size = v.getUint32(off + 4, true);
    if (id === 0x666d7420) {
      byteRate = v.getUint32(off + 16, true);
      blockAlign = v.getUint16(off + 20, true);
    }
    if (id === 0x64617461) {
      return { dataStart: off + 8, dataLen: Math.min(size, bytes.byteLength - off - 8), byteRate, blockAlign, headerEnd: off + 8 };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Keep only [from, to) seconds of the file's bytes (exact for WAV, close for compressed audio). */
function sliceBytes(bytes: ArrayBuffer, fileSec: number, from: number, to: number): { bytes: ArrayBuffer; startSec: number } {
  const wav = wavInfo(bytes);
  if (wav && wav.byteRate > 0 && wav.blockAlign > 0) {
    const a = Math.floor((from * wav.byteRate) / wav.blockAlign) * wav.blockAlign;
    const b = Math.min(wav.dataLen, Math.ceil((to * wav.byteRate) / wav.blockAlign) * wav.blockAlign);
    const header = new Uint8Array(bytes.slice(0, wav.headerEnd));
    const hv = new DataView(header.buffer);
    hv.setUint32(4, header.length - 8 + (b - a), true);
    hv.setUint32(wav.headerEnd - 4, b - a, true);
    const out = new Uint8Array(header.length + (b - a));
    out.set(header, 0);
    out.set(new Uint8Array(bytes, wav.dataStart + a, b - a), header.length);
    return { bytes: out.buffer, startSec: a / wav.byteRate };
  }
  // Compressed (mp3/aac/ogg): cut by the file's average byte rate; decoders resync on the next frame.
  const perSec = bytes.byteLength / Math.max(1, fileSec);
  const a = Math.max(0, Math.floor(from * perSec));
  const b = Math.min(bytes.byteLength, Math.ceil(to * perSec));
  return { bytes: bytes.slice(a, b), startSec: a / perSec };
}

/**
 * Decode the audio of `asset` needed for source time [needFrom, needTo)
 * (pass needTo = Infinity for "all of it", e.g. looping music).
 */
export async function loadAudio(
  ctx: BaseAudioContext,
  asset: RenderAsset & { durationSec?: number },
  needFrom: number,
  needTo: number,
): Promise<LoadedAudio> {
  const bytes = await bytesFor(asset);
  const wav = wavInfo(bytes);
  const fileSec = wav && wav.byteRate > 0 ? wav.dataLen / wav.byteRate : asset.durationSec ?? 0;
  const span = Number.isFinite(needTo) ? needTo - needFrom : Infinity;
  if (fileSec > MAX_DECODE_SEC && span < fileSec * 0.8) {
    const pad = 2;
    const cut = sliceBytes(bytes, fileSec, Math.max(0, needFrom - pad), Math.min(fileSec, needTo + pad));
    try {
      return { buffer: await ctx.decodeAudioData(cut.bytes), startSec: cut.startSec };
    } catch {
      // fall back to decoding everything
    }
  }
  if (fileSec > 3 * MAX_DECODE_SEC) throw new Error("the file is too long to decode — trim it or use a shorter track");
  try {
    return { buffer: await ctx.decodeAudioData(bytes), startSec: 0 };
  } catch {
    throw new Error("the file's format couldn't be read");
  }
}
