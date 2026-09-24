import { NextResponse } from "next/server";
import { z } from "zod";
import { writeScriptSections } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const text = (max: number) => z.string().max(max).default("");

const body = z.object({
  topic: text(500),
  audience: text(500),
  format: z.string().max(80),
  tone: z.string().max(80),
  complexity: z.string().max(80),
  structure: z.string().max(80),
  targetWords: z.number().int().min(50).max(4000),
  instruction: text(1000),
  hookText: text(1000),
  promiseText: text(500),
  takeawayText: text(500),
  points: z.array(z.string().max(300)).max(20).default([]),
  ctaText: text(300),
  sections: z.array(z.object({ type: z.string().max(40), heading: z.string().max(120) })).min(1).max(20),
});

/** POST /api/v1/ai/script — Gemini writes each section of the chosen format (editor+). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const result = await writeScriptSections(input);
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed", ref: "script" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "script" });
    return toErrorResponse(providerFailure(error, "The generation service"));
  }
}
