import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { cacheKey, cachedSamples } from "@/src/server/market/store";
import { buildProfile, CATALOG, CATEGORIES, METHODOLOGY, type PlatformFocus } from "@/src/lib/market/signals";
import { toErrorResponse, validationError } from "@/src/server/errors";

const FOCUS: PlatformFocus[] = ["youtube", "long", "shorts"];

/**
 * GET /api/v1/market/niches?region=US&focus=youtube — the ranked catalogue
 * from cached live scans (no quota spent). Niches without a fresh scan are
 * listed in `pending` for the client to scan in batches.
 */
export async function GET(request: Request) {
  try {
    await requireWorkspace("viewer");
    const url = new URL(request.url);
    const region = (url.searchParams.get("region") ?? "").toUpperCase();
    if (region && !/^[A-Z]{2}$/.test(region)) throw validationError("Country must be a 2-letter code.");
    const focus = (url.searchParams.get("focus") ?? "youtube") as PlatformFocus;
    if (!FOCUS.includes(focus)) throw validationError("Unknown platform focus.");
    const cached = await cachedSamples(CATALOG.map((c) => c.query), region);
    const niches = [];
    const pending = [];
    for (const c of CATALOG) {
      const hit = cached.get(cacheKey(c.query, region));
      if (hit) niches.push(buildProfile({ ...c, region, samples: hit.data.samples, totalResults: hit.data.totalResults, scannedAt: hit.scannedAt, focus }));
      else pending.push(c);
    }
    niches.sort((a, b) => b.scores.overall - a.scores.overall);
    return NextResponse.json({ data: { region, focus, niches, pending, methodology: METHODOLOGY, categories: Object.values(CATEGORIES) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
