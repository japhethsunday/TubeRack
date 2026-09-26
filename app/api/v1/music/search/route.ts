import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { limiterFor } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse, validationError, BackendError } from "@/src/server/errors";
import { isMusicLibraryConfigured, MUSIC_MOODS, searchLibraryMusic, rememberPreviews, type MusicMoodId } from "@/src/server/music/library";

/** GET /api/v1/music/search?mood=piano&page=1 — royalty-free, commercial-use instrumental tracks. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("read").take(`music:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const url = new URL(request.url);
    const mood = url.searchParams.get("mood") ?? "";
    if (!(mood in MUSIC_MOODS)) throw validationError("Choose a music mood.");
    const page = Number(url.searchParams.get("page") ?? 1) || 1;
    const extra = (url.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 60);
    try {
      const tracks = await searchLibraryMusic(mood as MusicMoodId, page, extra);
      rememberPreviews(tracks);
      // Previews play through our server so the browser never depends on the music site allowing it.
      const out = tracks.map((t) => ({ ...t, previewUrl: `/api/v1/music/preview?id=${encodeURIComponent(t.id)}` }));
      return NextResponse.json({ data: { tracks: out } });
    } catch (error) {
      console.error("[music] search failed:", error instanceof Error ? error.message : error);
      throw new BackendError(
        "BACKEND_UNAVAILABLE",
        isMusicLibraryConfigured() ? "The music library is busy right now. Please try again in a minute." : "The music library isn't connected yet.",
      );
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
