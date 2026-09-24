import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { addToPlaylist, setThumbnail, uploadCaptions } from "@/src/server/google/channel";
import { FORCE_SSL_SCOPE, getConnection, hasScope, NotConnectedError } from "@/src/server/google/oauth";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("thumbnail"), videoId, mime: z.enum(["image/png", "image/jpeg"]), base64: z.string().min(100).max(2_900_000) }),
  z.object({ step: z.literal("captions"), videoId, language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/), name: z.string().max(150).default(""), vtt: z.string().min(8).max(1_000_000) }),
  z.object({ step: z.literal("playlist"), videoId, playlistId: z.string().min(2).max(64) }),
]);

/**
 * POST /api/v1/youtube/publish/step — one post-upload publishing step
 * (thumbnail, captions, or playlist). Each step is independent so the
 * client can retry exactly what failed.
 */
export async function POST(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    const input = await parseBody(request, body);
    const connection = await getConnection(workspaceId);
    if (!connection) throw new NotConnectedError();
    if (input.step === "thumbnail") {
      const bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
      if (bytes.byteLength > 2 * 1024 * 1024) throw validationError("Thumbnail is over YouTube's 2 MB limit.");
      await setThumbnail(workspaceId, input.videoId, bytes, input.mime);
    } else {
      if (!hasScope(connection, FORCE_SSL_SCOPE)) {
        throw validationError("Playlists and captions need one extra YouTube permission. Click “Allow playlists & captions” to grant it.");
      }
      if (input.step === "captions") await uploadCaptions(workspaceId, input.videoId, { language: input.language, name: input.name, vtt: input.vtt });
      else await addToPlaylist(workspaceId, input.playlistId, input.videoId);
    }
    return NextResponse.json({ data: { step: input.step, ok: true } });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
