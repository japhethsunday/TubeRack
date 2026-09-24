import { NextResponse } from "next/server";
import { fetchVideoDetails, parseVideoId } from "@/src/server/youtube/client";
import { requireUser } from "@/src/server/auth";
import { limiterFor } from "@/src/server/rate-limit";
import { providerFailure } from "@/src/server/ai/guard";
import { rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/details?id= — full video, channel, and top comments (signed in). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("write").take(`ytd:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const id = parseVideoId(new URL(request.url).searchParams.get("id") ?? "");
    if (!id) throw validationError("Paste a YouTube video link or 11-character video id.");
    return NextResponse.json({ data: await fetchVideoDetails(id) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}
