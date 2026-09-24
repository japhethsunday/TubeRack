"use client";

/**
 * Resumable upload to a YouTube upload session URL (created server-side by
 * /api/v1/youtube/upload). Bytes go straight from the browser to YouTube.
 * Network failures resume from the last byte YouTube confirmed.
 */

export class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

interface PutResult {
  status: number;
  range: string | null;
  body: string;
}

function put(url: string, body: Blob | null, headers: Record<string, string>, onProgress?: (loaded: number) => void, signal?: AbortSignal): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader("Range"), body: xhr.responseText });
    xhr.onerror = () => reject(new UploadError("Network error while uploading.", true));
    xhr.ontimeout = () => reject(new UploadError("Upload timed out.", true));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", false));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Ask YouTube how many bytes it has; returns the next offset, or the finished video. */
async function queryOffset(url: string, size: number, signal?: AbortSignal): Promise<{ offset: number; done?: { id: string } }> {
  const r = await put(url, null, { "Content-Range": `bytes */${size}` }, undefined, signal);
  if (r.status === 200 || r.status === 201) return { offset: size, done: JSON.parse(r.body) as { id: string } };
  if (r.status === 308) {
    const m = /bytes=0-(\d+)/.exec(r.range ?? "");
    return { offset: m ? Number(m[1]) + 1 : 0 };
  }
  if (r.status === 404 || r.status === 410) throw new UploadError("The upload session expired. Start the upload again.", false);
  throw new UploadError(`YouTube upload check failed (${r.status}).`, r.status >= 500);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadResumable(
  url: string,
  file: Blob,
  opts: { onProgress: (sent: number, total: number) => void; signal?: AbortSignal; resume?: boolean; maxRetries?: number },
): Promise<{ id: string }> {
  const size = file.size;
  let offset = 0;
  if (opts.resume) {
    const q = await queryOffset(url, size, opts.signal);
    if (q.done) return q.done;
    offset = q.offset;
  }
  let attempt = 0;
  for (;;) {
    try {
      const chunk = offset === 0 ? file : file.slice(offset);
      const headers: Record<string, string> = { "Content-Type": file.type || "video/mp4" };
      if (offset > 0) headers["Content-Range"] = `bytes ${offset}-${size - 1}/${size}`;
      const r = await put(url, chunk, headers, (loaded) => opts.onProgress(Math.min(size, offset + loaded), size), opts.signal);
      if (r.status === 200 || r.status === 201) {
        opts.onProgress(size, size);
        return JSON.parse(r.body) as { id: string };
      }
      if (r.status === 308) {
        const m = /bytes=0-(\d+)/.exec(r.range ?? "");
        offset = m ? Number(m[1]) + 1 : offset;
        continue;
      }
      let message = `YouTube rejected the upload (${r.status}).`;
      try {
        const e = JSON.parse(r.body) as { error?: { message?: string; errors?: { reason?: string }[] } };
        const reason = e.error?.errors?.[0]?.reason;
        if (reason === "uploadLimitExceeded" || reason === "quotaExceeded") message = "YouTube's daily upload limit for this account or API project was reached. Try again tomorrow.";
        else if (e.error?.message) message = `YouTube rejected the upload: ${e.error.message}`;
      } catch {
        // keep the generic message
      }
      throw new UploadError(message, r.status >= 500);
    } catch (error) {
      const retryable = error instanceof UploadError ? error.retryable : true;
      if (!retryable || attempt >= (opts.maxRetries ?? 5)) throw error;
      attempt++;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      const q = await queryOffset(url, size, opts.signal).catch(() => ({ offset }));
      if ("done" in q && q.done) return q.done;
      offset = q.offset;
    }
  }
}
