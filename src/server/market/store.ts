import { createHash } from "node:crypto";
import { getDb } from "@/src/server/db";
import { backendUnavailable } from "@/src/server/errors";
import { scanMarket } from "@/src/server/youtube/client";
import { buildProfile, type CategoryId, type MarketSample, type NicheProfile, type PlatformFocus } from "@/src/lib/market/signals";

/** Public market samples are shared across users and refreshed daily. */
export const CACHE_HOURS = 24;

interface CachedSample {
  samples: MarketSample[];
  totalResults: number | null;
}

export function cacheKey(query: string, region: string): string {
  return createHash("sha256").update(`${query.trim().toLowerCase()}|${region}`).digest("hex").slice(0, 40);
}

function db() {
  const d = getDb();
  if (!d) throw backendUnavailable("Database");
  return d;
}

/** Cached samples for many queries at once (fresh rows only). */
export async function cachedSamples(queries: string[], region: string): Promise<Map<string, { data: CachedSample; scannedAt: string }>> {
  const keys = queries.map((q) => cacheKey(q, region));
  const rows = await db()`
    SELECT key, data, scanned_at FROM niche_market_cache
    WHERE key IN ${db()(keys)} AND scanned_at > now() - make_interval(hours => ${CACHE_HOURS})
  `;
  const out = new Map<string, { data: CachedSample; scannedAt: string }>();
  for (const r of rows as unknown as { key: string; data: CachedSample; scanned_at: Date | string }[]) {
    out.set(r.key, { data: r.data, scannedAt: new Date(r.scanned_at).toISOString() });
  }
  return out;
}

/** Profile for one niche: cached sample if fresh, otherwise a live scan (then cached). */
export async function marketProfile(input: { name: string; query: string; region: string; category: CategoryId; focus: PlatformFocus; force?: boolean }): Promise<NicheProfile & { cached: boolean }> {
  const key = cacheKey(input.query, input.region);
  if (!input.force) {
    const hit = (await cachedSamples([input.query], input.region)).get(key);
    if (hit) {
      return { ...buildProfile({ ...input, samples: hit.data.samples, totalResults: hit.data.totalResults, scannedAt: hit.scannedAt }), cached: true };
    }
  }
  const scan = await scanMarket(input.query, { regionCode: input.region || undefined });
  const scannedAt = new Date().toISOString();
  await db()`
    INSERT INTO niche_market_cache (key, query, region, data, scanned_at)
    VALUES (${key}, ${input.query.trim().toLowerCase()}, ${input.region}, ${scan as never}, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, scanned_at = now()
  `;
  return { ...buildProfile({ ...input, samples: scan.samples, totalResults: scan.totalResults, scannedAt }), cached: false };
}
