"use client";

/**
 * Device media store on the Origin Private File System (OPFS): private to
 * this site, survives reloads, streams from disk (no size cap beyond the
 * browser's storage quota), and never leaves the device.
 */

const DIR = "tuberack-media";

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export async function localStoreAvailable(): Promise<boolean> {
  return (await dir()) !== null;
}

const safe = (id: string) => id.replace(/[^\w.-]/g, "_");

/** Stream a file to disk in chunks (never holds the whole file in memory). */
export async function saveLocal(id: string, file: Blob, onProgress?: (ratio: number) => void, signal?: AbortSignal): Promise<void> {
  const d = await dir();
  if (!d) throw new Error("This browser can't store large files on the device.");
  try {
    await navigator.storage.persist?.();
  } catch {
    // best effort: ask the browser not to evict our files
  }
  const handle = await d.getFileHandle(safe(id), { create: true });
  const writable = await handle.createWritable();
  const CHUNK = 8 * 1024 * 1024;
  try {
    for (let off = 0; off < file.size; off += CHUNK) {
      if (signal?.aborted) throw new Error("Import cancelled.");
      await writable.write(file.slice(off, Math.min(file.size, off + CHUNK)));
      onProgress?.(Math.min(1, (off + CHUNK) / file.size));
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await d.removeEntry(safe(id)).catch(() => undefined);
    throw error;
  }
}

/** A disk-backed File (reads lazily; safe for multi-GB media). */
export async function loadLocal(id: string): Promise<File | null> {
  const d = await dir();
  if (!d) return null;
  try {
    return await (await d.getFileHandle(safe(id))).getFile();
  } catch {
    return null;
  }
}

export async function removeLocal(id: string): Promise<void> {
  const d = await dir();
  await d?.removeEntry(safe(id)).catch(() => undefined);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
