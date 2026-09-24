import { NextResponse } from "next/server";
import { z } from "zod";
import { writeNicheReport } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  name: z.string().trim().min(1).max(120),
  query: z.string().trim().min(1).max(200),
  angle: z.string().trim().max(400).default(""),
  metrics: z.record(z.string(), z.unknown()).default({}),
  scores: z.record(z.string(), z.unknown()).default({}),
  topTitles: z.array(z.string().max(300)).max(15).default([]),
});

/** POST /api/v1/niche/report — Gemini launch plan grounded in the scan's metrics. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const { report, model } = await writeNicheReport(input);
    await recordUsage(caller, { kind: "text", provider: "gemini", model, status: "completed", ref: `niche-report:${input.name.slice(0, 60)}` });
    return NextResponse.json({ data: { report, model } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "niche-report" });
    return toErrorResponse(providerFailure(error, "Gemini (GEMINI_API_KEY)"));
  }
}
