import { NextResponse } from "next/server";
import { z } from "zod";
import { writePackaging } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const field = (max: number) => z.string().max(max).default("");

const body = z.object({
  kind: z.enum(["titles", "seo"]),
  context: z.object({
    topic: field(500),
    audience: field(500),
    promise: field(500),
    takeaway: field(500),
    cta: field(300),
    title: field(200),
    script: field(20000),
    chapters: field(3000),
  }),
});

/** POST /api/v1/ai/package — Gemini title options or SEO description/tags (editor+). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  let kind = "";
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    kind = input.kind;
    const result = await writePackaging(input.kind, input.context);
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed", ref: kind });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller && kind) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: kind });
    return toErrorResponse(providerFailure(error, "The generation service"));
  }
}
