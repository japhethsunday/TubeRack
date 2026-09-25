import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProviderCall, storeGenerated } from "@/src/server/ai/guard";
import { toErrorResponse, BackendError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { downloadTrack, libraryTrack } from "@/src/server/music/library";

export const maxDuration = 120;

const body = z.object({ id: z.string().regex(/^(?:[0-9a-f-]{36}|jm-\d{1,12})$/i, "Unknown track.") });

/**
 * POST /api/v1/music/import — copy a library track into the workspace's
 * storage (so previews and exports never depend on the library being up).
 * The track is re-read from the library by id; client URLs are never fetched.
 */
export async function POST(request: Request) {
  try {
    const caller = await guardProviderCall();
    const { id } = await parseBody(request, body);
    let track;
    let file;
    try {
      track = await libraryTrack(id);
      file = await downloadTrack(track);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new BackendError("BACKEND_UNAVAILABLE", /license|large|empty/i.test(message) ? message : "Couldn't fetch this track right now. Please try another one.");
    }
    const url = await storeGenerated(caller, file.bytes, file.mime, file.ext);
    if (!url) throw new BackendError("BACKEND_UNAVAILABLE", "File storage isn't available right now.");
    return NextResponse.json({ data: { url, mime: file.mime, fileSize: file.bytes.byteLength, track } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
