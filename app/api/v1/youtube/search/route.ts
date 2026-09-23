import { NextResponse } from "next/server";
import { searchVideos } from "@/src/server/youtube/client";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/search?q=&limit= — keyword research via Data API (editor+, metered). */
export async function GET(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim();
    if (!q || q.length > 200) throw validationError("Enter a search query (max 200 characters).");
    const limit = Number(params.get("limit") ?? 10);
    const results = await searchVideos(q, Number.isFinite(limit) ? limit : 10);
    await recordUsage(caller, { kind: "research", provider: "youtube", status: "completed", ref: q.slice(0, 100) });
    return NextResponse.json({ data: { query: q, results } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "research", provider: "youtube", status: "failed" });
    return toErrorResponse(providerFailure(error, "YouTube search (YOUTUBE_API_KEY)"));
  }
}
