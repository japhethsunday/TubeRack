import { NextResponse } from "next/server";
import { fetchVideoSnapshot, parseVideoId } from "@/src/server/youtube/client";
import { requireUser } from "@/src/server/auth";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { providerFailure } from "@/src/server/ai/guard";
import { rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/video?url= — snapshot for a video URL or id (signed in). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("write").take(`yt:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await requireUser();
    const raw = new URL(request.url).searchParams.get("url") ?? "";
    const id = parseVideoId(raw);
    if (!id) throw validationError("Paste a YouTube video link or 11-character video id.");
    const snapshot = await fetchVideoSnapshot(id);
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}
