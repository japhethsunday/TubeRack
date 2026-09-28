import { NextResponse } from "next/server";
import { sharedLimit } from "@/src/server/shared-limit";
import { z } from "zod";
import { guardProviderCall, storeGenerated } from "@/src/server/ai/guard";
import { toErrorResponse, BackendError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { getDb } from "@/src/server/db";
import { storedFileExists } from "@/src/server/storage-cleaner";
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
    // Each import stores a file: cap per user per day.
    await sharedLimit(`music-import:${caller.user.id}`, 150, 86400);
    const { id } = await parseBody(request, body);
    // Already saved in this workspace? Reuse that file instead of storing another copy.
    const db = getDb();
    if (db) {
      const [prev] = await db`
        SELECT payload, mime, file_size FROM media_assets
        WHERE workspace_id = ${caller.workspaceId} AND ${`track:${id}`} = ANY(tags) AND payload LIKE '/api/v1/generated/%' AND status = 'ready'
        ORDER BY updated_at DESC LIMIT 1`;
      if (prev && (await storedFileExists(caller.workspaceId, String(prev.payload)))) {
        const meta = await libraryTrack(id).catch(() => null);
        return NextResponse.json({ data: { url: String(prev.payload), mime: String(prev.mime), fileSize: Number(prev.file_size ?? 0), track: meta, reused: true } });
      }
    }
    let track;
    let file;
    try {
      track = await libraryTrack(id);
      file = await downloadTrack(track);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      console.error(`[music] import ${id} failed:`, message);
      throw new BackendError("BACKEND_UNAVAILABLE", /license|large|empty/i.test(message) ? message : "Couldn't fetch this track right now. Please try another one.");
    }
    const url = await storeGenerated(caller, file.bytes, file.mime, file.ext);
    if (!url) throw new BackendError("BACKEND_UNAVAILABLE", "File storage isn't available right now.");
    return NextResponse.json({ data: { url, mime: file.mime, fileSize: file.bytes.byteLength, track } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
