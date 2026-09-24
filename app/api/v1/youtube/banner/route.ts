import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { FORCE_SSL_SCOPE, getConnection, hasScope } from "@/src/server/google/oauth";
import { uploadChannelBanner } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { sharedLimit } from "@/src/server/shared-limit";

export const maxDuration = 300;
// Vercel caps request bodies at 4.5 MB; the client compresses banners below this.
const MAX_BYTES = 4 * 1024 * 1024;

function sniff(b: Uint8Array): "image/jpeg" | "image/png" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/** POST /api/v1/youtube/banner — raw JPEG/PNG body; uploads and sets the channel banner. */
export async function POST(request: Request) {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    await sharedLimit(`yt-banner:${user.id}`, 10, 3600);
    const conn = await getConnection(workspaceId);
    if (!conn) throw validationError("Connect your YouTube channel first.");
    if (!hasScope(conn, FORCE_SSL_SCOPE)) throw validationError("Grant the “manage your channel” permission first (Reconnect with permission).");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw validationError("Banner must be a JPEG or PNG under 4 MB.");
    const mime = sniff(bytes);
    if (!mime) throw validationError("Banner must be a JPEG or PNG image.");
    return NextResponse.json({ data: await uploadChannelBanner(workspaceId, bytes, mime) });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
