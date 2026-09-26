import { requireUser } from "@/src/server/auth";
import { limiterFor } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse, validationError, BackendError } from "@/src/server/errors";
import { fetchPreview, previewSources } from "@/src/server/music/library";

export const maxDuration = 60;

/** GET /api/v1/music/preview?id=… — streams a library track's preview audio (seekable). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("read").take(`music-preview:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const params = new URL(request.url).searchParams;
    const id = params.get("id") ?? "";
    if (!/^(jm-\d{1,12}|[0-9a-f-]{36})$/i.test(id)) throw validationError("Unknown track.");
    let upstream: Response;
    try {
      const sources = await previewSources(id, params.get("s"), params.get("sig"));
      upstream = await fetchPreview(sources, request.headers.get("range"), id);
    } catch (e) {
      console.warn(`[music] preview ${id}:`, e instanceof Error ? e.message : e);
      throw new BackendError("BACKEND_UNAVAILABLE", "This preview isn't available right now.");
    }

    const type = upstream.headers.get("content-type") ?? "";
    const headers = new Headers({
      "Content-Type": type.startsWith("audio/") ? type : "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
