"use client";

/**
 * Stored files are served through /api/v1/generated|uploads/<file>, which
 * redirects to a short-lived signed storage link. Video elements fetch in
 * many range requests, and some browsers reject a video whose pieces arrive
 * through redirects — the clip stays black. For video we ask for the signed
 * link once (cached ~50 min) and play it directly.
 */
const STORED = /^\/api\/v1\/(generated|uploads)\/[^/?]+$/;
const cache = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string>>();

export function isStoredPath(url: string): boolean {
  return STORED.test(url);
}

export async function directMediaUrl(url: string): Promise<string> {
  if (!STORED.test(url)) return url;
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.url;
  let p = pending.get(url);
  if (!p) {
    p = fetch(`${url}?resolve=1`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as { data?: { url?: string } } | null;
        const direct = r.ok ? body?.data?.url : null;
        if (!direct) return url; // fall back to the redirecting path
        cache.set(url, { url: direct, until: Date.now() + 50 * 60 * 1000 });
        return direct;
      })
      .catch(() => url)
      .finally(() => pending.delete(url));
    pending.set(url, p);
  }
  return p;
}

/**
 * fetch() for media: stored files are fetched from their direct signed link.
 * (Following the app's redirect to the storage host makes browsers send
 * "Origin: null", which the storage CORS rule rightly refuses.)
 */
export async function mediaFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(await directMediaUrl(url), init);
}
