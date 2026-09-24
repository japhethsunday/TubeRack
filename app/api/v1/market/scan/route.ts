import { NextResponse } from "next/server";
import { z } from "zod";
import { marketProfile } from "@/src/server/market/store";
import { CATEGORIES, guessCategory, type CategoryId } from "@/src/lib/market/signals";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const body = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        query: z.string().trim().min(2).max(120),
        category: z.string().optional(),
      }),
    )
    .min(1)
    .max(6),
  region: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).default(""),
  focus: z.enum(["youtube", "long", "shorts"]).default("youtube"),
  /** Ignore the 24 h cache (costs quota). */
  refresh: z.boolean().default(false),
});

/**
 * POST /api/v1/market/scan — live-scan up to 6 niches (catalogue or custom).
 * ~103 YouTube quota units per niche that isn't cached.
 */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const settled = await Promise.allSettled(
      input.items.map((it) => {
        const category = (it.category && it.category in CATEGORIES ? it.category : guessCategory(`${it.name} ${it.query}`)) as CategoryId;
        return marketProfile({ name: it.name, query: it.query, region: input.region, category, focus: input.focus, force: input.refresh });
      }),
    );
    const niches = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    const failures = settled.flatMap((s, i) => (s.status === "rejected" ? [`${input.items[i].name}: ${s.reason instanceof Error ? s.reason.message.slice(0, 200) : "scan failed"}`] : []));
    if (niches.length === 0) throw new Error(failures[0] ?? "No niche could be scanned.");
    const live = niches.filter((n) => !n.cached).length;
    if (live) await recordUsage(caller, { kind: "research", provider: "youtube", status: "completed", ref: `market:${live}` });
    return NextResponse.json({ data: { niches, failures } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "research", provider: "youtube", status: "failed", ref: "market" });
    return toErrorResponse(providerFailure(error, "Market research (YOUTUBE_API_KEY)"));
  }
}
