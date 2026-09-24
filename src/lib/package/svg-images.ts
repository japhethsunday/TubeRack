"use client";

/**
 * Thumbnail bases reference their photo by app URL (kept in file storage so
 * synced SVG stays small). An SVG loaded through <img> or saved as a file
 * can't fetch external resources, so those references are inlined as data
 * URLs right before rasterising or downloading.
 */

const STORED_HREF = /(href=")(\/api\/v1\/(?:uploads|generated)\/[0-9a-f-]{36}\.(?:png|jpg|gif|webp))(")/g;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(blob);
  });
}

export async function inlineSvgImages(svg: string): Promise<string> {
  const urls = [...new Set([...svg.matchAll(STORED_HREF)].map((m) => m[2]))];
  if (!urls.length) return svg;
  const inlined = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const res = await fetch(u, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Thumbnail image is unavailable.");
      inlined.set(u, await toDataUrl(await res.blob()));
    }),
  );
  return svg.replace(STORED_HREF, (m, a: string, u: string, b: string) => `${a}${inlined.get(u) ?? u}${b}`);
}

/** Store a thumbnail photo in the account; returns its app URL, or null when unavailable. */
export async function storeThumbnailImage(blob: Blob): Promise<string | null> {
  try {
    const sign = await fetch("/api/v1/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: blob.type, size: blob.size }),
    });
    if (!sign.ok) return null;
    const { data } = (await sign.json()) as { data: { uploadUrl: string; fileUrl: string } };
    const put = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
    return put.ok ? data.fileUrl : null;
  } catch {
    return null;
  }
}
