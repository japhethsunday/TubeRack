import { NextResponse } from "next/server";
import { z } from "zod";
import { planSceneVisuals } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  topic: z.string().trim().min(1).max(300),
  aspect: z.enum(["16:9", "9:16"]).default("16:9"),
  style: z.string().trim().max(300).default(""),
  scenes: z.array(z.object({ title: z.string().max(200), text: z.string().max(4000) })).min(1).max(30),
});

/** POST /api/v1/ai/scene-visuals — image prompts + on-screen text per scene (auto-video). */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const out = await planSceneVisuals(input);
    await recordUsage(caller, { kind: "text", provider: "gemini", model: out.model, status: "completed", ref: "scene-visuals" });
    return NextResponse.json({ data: out });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "scene-visuals" });
    return toErrorResponse(providerFailure(error, "Gemini (GEMINI_API_KEY)"));
  }
}
