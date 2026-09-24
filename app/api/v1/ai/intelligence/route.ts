import { NextResponse } from "next/server";
import { z } from "zod";
import { INTELLIGENCE_TASKS } from "@/src/lib/intelligence/tasks";
import { requestIntelligence } from "@/src/lib/ai-gateway/intelligence";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  task: z.enum(INTELLIGENCE_TASKS),
  context: z.record(z.string(), z.unknown()).default({}),
});

/** POST /api/v1/ai/intelligence — run an intelligence task through Gemini (editor+). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  let task = "";
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    task = input.task;
    const result = await requestIntelligence({ task: input.task, context: input.context });
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed", ref: task });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller && task) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: task });
    return toErrorResponse(providerFailure(error, "Gemini (GEMINI_API_KEY)"));
  }
}
