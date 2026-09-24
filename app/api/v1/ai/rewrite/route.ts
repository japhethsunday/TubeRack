import { NextResponse } from "next/server";
import { z } from "zod";
import { rewriteSection } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  heading: z.string().max(120).default(""),
  text: z.string().trim().min(1, "The section is empty — write something first.").max(12000),
  instruction: z.string().max(1000).default(""),
  topic: z.string().max(500).default(""),
});

/** POST /api/v1/ai/rewrite — Gemini rewrites one script section (editor+). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const result = await rewriteSection(input);
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed", ref: "rewrite" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "rewrite" });
    return toErrorResponse(providerFailure(error, "The generation service"));
  }
}
