"use client";

import { api } from "@/src/lib/api";

function putWithProgress(url: string, body: Blob, mime: string, onProgress: (r: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Cloud upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Cloud upload failed: network error."));
    xhr.onabort = () => reject(new Error("Import cancelled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/**
 * Upload bytes to the account's storage (in parts when larger than one
 * storage object allows). Returns the app URL to reference and how many
 * parts were used.
 */
export async function uploadToCloud(
  file: Blob,
  mime: string,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ fileUrl: string; parts: number }> {
  const signed = await api.post<{ uploadUrls: string[]; partBytes: number; fileUrl: string }>("/api/v1/uploads/sign", { mime, size: file.size });
  const n = signed.uploadUrls.length;
  for (const [i, url] of signed.uploadUrls.entries()) {
    const part = n === 1 ? file : file.slice(i * signed.partBytes, (i + 1) * signed.partBytes);
    await putWithProgress(url, part, mime, (r) => onProgress?.((i + r) / n), signal);
  }
  return { fileUrl: signed.fileUrl, parts: n };
}
