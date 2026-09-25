import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProviderCall, providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { findOutliers } from "@/src/server/content/recreate";

export const maxDuration = 60;

const body = z.object({
  query: z.string().trim().min(2).max(120),
  days: z.number().int().refine((d) => [7, 30, 90, 180, 365].includes(d)).default(90),
  format: z.enum(["any", "long", "short"]).default("any"),
});

/** POST /api/v1/recreate/outliers — videos beating their channel's size in a niche. */
export async function POST(request: Request) {
  try {
    await guardProviderCall();
    const input = await parseBody(request, body);
    return NextResponse.json({ data: await findOutliers(input) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "Video Recreator"));
  }
}
