import { NextResponse } from "next/server";
import { z } from "zod";
import { scanNiche } from "@/src/server/youtube/client";
import { expandNiches, isGeminiConfigured, type NicheCandidate } from "@/src/server/ai/gemini";
import { nicheMetrics, nicheScores, type NicheMetrics, type NicheScores, type NicheVideoSample } from "@/src/lib/niche/score";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  seed: z.string().trim().min(2).max(200),
  audience: z.string().trim().max(200).default(""),
  region: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).default(""),
  count: z.number().int().min(1).max(8).default(6),
  /** "expand": Gemini proposes sub-niches; "exact": scan the seed as typed. */
  mode: z.enum(["expand", "exact"]).default("expand"),
  days: z.number().int().min(30).max(365).default(180),
});

/**
 * POST /api/v1/niche/scan — find and score YouTube niches from live data.
 * Each niche costs ~102 YouTube quota units; scans run 3 at a time.
 */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    let candidates: NicheCandidate[];
    let model: string | null = null;
    if (input.mode === "expand") {
      if (!isGeminiConfigured()) throw validationError("Niche ideas need Gemini (GEMINI_API_KEY). Switch to “Scan exactly this niche”.");
      const expanded = await expandNiches({ seed: input.seed, audience: input.audience, count: input.count });
      candidates = expanded.niches;
      model = expanded.model;
    } else {
      candidates = [{ name: input.seed, query: input.seed, angle: "", audience: input.audience }];
    }

    const results: (NicheCandidate & { metrics: NicheMetrics; scores: NicheScores; topVideos: NicheVideoSample[] })[] = [];
    const failures: string[] = [];
    for (let i = 0; i < candidates.length; i += 3) {
      const batch = candidates.slice(i, i + 3);
      const settled = await Promise.allSettled(batch.map((c) => scanNiche(c.query, { days: input.days, regionCode: input.region || undefined })));
      settled.forEach((s, j) => {
        const c = batch[j];
        if (s.status === "rejected") {
          failures.push(`${c.name}: ${s.reason instanceof Error ? s.reason.message.slice(0, 160) : "scan failed"}`);
          return;
        }
        const metrics = nicheMetrics(s.value.samples, s.value.totalResults);
        const top = [...s.value.samples].sort((a, b) => b.views - a.views).slice(0, 8);
        results.push({ ...c, metrics, scores: nicheScores(metrics), topVideos: top });
      });
    }
    if (results.length === 0) throw new Error(failures[0] ?? "No niches could be scanned.");
    results.sort((a, b) => b.scores.overall - a.scores.overall);
    await recordUsage(caller, { kind: "research", provider: "youtube", status: "completed", ref: `niche:${input.seed.slice(0, 80)}` });
    return NextResponse.json({ data: { seed: input.seed, days: input.days, model, niches: results, failures } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "research", provider: "youtube", status: "failed", ref: "niche" });
    return toErrorResponse(providerFailure(error, "Niche finder (YOUTUBE_API_KEY)"));
  }
}
