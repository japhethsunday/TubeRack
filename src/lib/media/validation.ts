/**
 * Upload validation — Phase 7.
 * Magic-byte sniffing plus size caps. Extensions are hints only; the bytes
 * decide. Server-side revalidation still applies in Phase 11.
 */

export type UploadKind = "image" | "video" | "audio";

export interface ValidatedUpload {
  kind: UploadKind;
  mime: string;
}

const SIGNATURES: { kind: UploadKind; mime: string; bytes: number[]; mask?: number[] }[] = [
  { kind: "image", mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { kind: "image", mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { kind: "image", mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { kind: "image", mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
  { kind: "video", mime: "video/mp4", bytes: [0x66, 0x74, 0x79, 0x70], mask: [0, 4] },
  { kind: "video", mime: "video/webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: "audio", mime: "audio/mpeg", bytes: [0x49, 0x44, 0x33] },
  { kind: "audio", mime: "audio/mpeg", bytes: [0xff, 0xfb] },
  { kind: "audio", mime: "audio/wav", bytes: [0x52, 0x49, 0x46, 0x46] },
  { kind: "audio", mime: "audio/ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },
];

export const UPLOAD_LIMITS: Record<UploadKind, { bytes: number; label: string }> = {
  image: { bytes: 25 * 1024 * 1024, label: "25 MB" },
  // Large videos are stored on the device (OPFS) and stream from disk.
  video: { bytes: 20 * 1024 * 1024 * 1024, label: "20 GB" },
  audio: { bytes: 1024 * 1024 * 1024, label: "1 GB" },
};

function sniff(header: Uint8Array): ValidatedUpload | null {
  for (const sig of SIGNATURES) {
    const offset = sig.mask?.[1] ?? 0;
    let ok = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (header[offset + i] !== sig.bytes[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      // WAV vs other RIFF: check WAVE marker.
      if (sig.mime === "audio/wav" && !(header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45)) {
        continue;
      }
      // WebP vs WAV share RIFF: check WEBP marker.
      if (sig.mime === "image/webp" && !(header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50)) {
        continue;
      }
      if (sig.mime === "video/mp4") {
        const brand = String.fromCharCode(header[8], header[9], header[10], header[11]);
        if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
        if (brand === "M4A " || brand === "M4B ") return { kind: "audio", mime: "audio/mp4" };
      }
      return { kind: sig.kind, mime: sig.mime };
    }
  }
  return null;
}

/** Validate header bytes + size. Returns kind or a useful error. */
export function validateUpload(header: Uint8Array, size: number): ValidatedUpload {
  const found = sniff(header);
  if (!found) {
    throw new Error("Unrecognized file type. Supported: MP4, MOV, WebM, MKV, PNG, JPEG, GIF, WebP, MP3, M4A, WAV, OGG — by content, not extension.");
  }
  const limit = UPLOAD_LIMITS[found.kind];
  if (size > limit.bytes) {
    throw new Error(`File is too large for ${found.kind} (${limit.label} maximum).`);
  }
  if (size === 0) throw new Error("File is empty.");
  return found;
}

/** Read the first bytes of a File for sniffing. */
export function readHeader(file: Blob, length = 12): Promise<Uint8Array> {
  return file.slice(0, length).arrayBuffer().then((buf) => new Uint8Array(buf));
}
