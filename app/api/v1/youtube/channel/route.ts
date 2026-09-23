import { NextResponse } from "next/server";
import { fetchChannelSnapshot } from "@/src/server/youtube/client";
import { requireUser } from "@/src/server/auth";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { providerFailure } from "@/src/server/ai/guard";
import { rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/channel?id=UC… — channel snapshot (signed in). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("write").take(`yt:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await requireUser();
    const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(id)) throw validationError("Enter a channel id (starts with UC, 24 characters).");
    const snapshot = await fetchChannelSnapshot(id);
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube (YOUTUBE_API_KEY)"));
  }
}
