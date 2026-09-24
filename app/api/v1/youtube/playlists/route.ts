import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { createPlaylist, myPlaylists } from "@/src/server/google/channel";
import { z } from "zod";
import { FORCE_SSL_SCOPE, getConnection, hasScope } from "@/src/server/google/oauth";
import { parseBody } from "@/src/server/validate";
import { sharedLimit } from "@/src/server/shared-limit";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";

/** GET /api/v1/youtube/playlists — playlists on the connected channel. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await myPlaylists(workspaceId) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}

const createBody = z.object({
  playlists: z
    .array(z.object({ title: z.string().trim().min(1).max(150), description: z.string().max(5000).default(""), privacy: z.enum(["public", "unlisted", "private"]).default("public") }))
    .min(1)
    .max(8),
});

/** POST /api/v1/youtube/playlists — create playlists (50 quota units each); skips titles that already exist. */
export async function POST(request: Request) {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    await sharedLimit(`yt-playlists:${user.id}`, 20, 3600);
    const { playlists } = await parseBody(request, createBody);
    const conn = await getConnection(workspaceId);
    if (!conn) throw validationError("Connect your YouTube channel first.");
    if (!hasScope(conn, FORCE_SSL_SCOPE)) throw validationError("Grant the “manage your channel” permission first (Reconnect with permission).");
    const existing = new Set((await myPlaylists(workspaceId)).map((p) => p.title.trim().toLowerCase()));
    const created = [];
    const skipped = [];
    for (const p of playlists) {
      if (existing.has(p.title.trim().toLowerCase())) {
        skipped.push(p.title);
        continue;
      }
      created.push(await createPlaylist(workspaceId, p));
    }
    return NextResponse.json({ data: { created, skipped } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
