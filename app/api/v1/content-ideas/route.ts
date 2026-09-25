import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { generateContentIdeas } from "@/src/server/content/ideas";

export const maxDuration = 120;

const body = z.object({
  niche: z.string().trim().max(120).default(""),
  audience: z.string().trim().max(200).default(""),
  count: z.number().int().min(5).max(20).default(10),
  format: z.enum(["any", "long", "short"]).default("any"),
  useChannel: z.boolean().default(true),
});

/** POST /api/v1/content-ideas — study the connected channel + niche, then write grounded video ideas. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    let result;
    try {
      result = await generateContentIdeas({ workspaceId: caller.workspaceId, ...input });
    } catch (error) {
      if (error instanceof Error && /Enter your niche/.test(error.message)) throw validationError(error.message);
      throw error;
    }
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed" });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed" }).catch(() => undefined);
    return toErrorResponse(providerFailure(error, "Content Creator"));
  }
}
