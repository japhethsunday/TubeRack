/**
 * Large media in cloud storage.
 *
 * The storage plan caps a single object at 50 MB, so bigger files are
 * uploaded as consecutive parts and referenced as
 *   /api/v1/uploads/<uuid>.<ext>?parts=N
 * Each part lives at /api/v1/uploads/<uuid>.<ext>.partI. Other devices
 * download the parts and reassemble the original bytes.
 */

export const PART_BYTES = 45 * 1024 * 1024;
export const MAX_PARTS = 64; // ~2.8 GB

const CHUNKED = /^(\/api\/v1\/uploads\/[0-9a-f-]{36}\.[a-z0-9]+)\?parts=(\d{1,2})$/;

export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / PART_BYTES));
}

/** Part URLs for a chunked payload, or null when the payload is a single file. */
export function chunkedParts(payload: string): string[] | null {
  const m = CHUNKED.exec(payload);
  if (!m) return null;
  const n = Number(m[2]);
  if (n < 2 || n > MAX_PARTS) return null;
  return Array.from({ length: n }, (_, i) => `${m[1]}.part${i}`);
}

export function isChunked(payload: string): boolean {
  return chunkedParts(payload) !== null;
}

/** Download and reassemble a chunked upload. */
export async function downloadChunked(
  payload: string,
  mime: string,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const parts = chunkedParts(payload);
  if (!parts) throw new Error("Not a multi-part upload.");
  const blobs: Blob[] = [];
  for (const [i, url] of parts.entries()) {
    const res = await fetch(url, { credentials: "same-origin", signal });
    if (!res.ok) throw new Error(`Could not download part ${i + 1} of ${parts.length} (${res.status}).`);
    blobs.push(await res.blob());
    onProgress?.((i + 1) / parts.length);
  }
  return new Blob(blobs, { type: mime || "application/octet-stream" });
}
