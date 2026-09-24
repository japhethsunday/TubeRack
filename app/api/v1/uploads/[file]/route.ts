import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { storageSignedUrl } from "@/src/server/storage";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { notFound, rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

// A whole file, or one part of a multi-part upload (".partN").
const FILE = /^[0-9a-f-]{36}\.(png|jpg|gif|webp|mp4|webm|mov|mp3|m4a|wav|ogg)(\.part\d{1,2})?$/;

/** GET /api/v1/uploads/:file — owner-only; redirects to a 1-hour signed link (supports video seeking). */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const { file } = await params;
    if (!FILE.test(file)) throw validationError("Invalid file.");
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "viewer");
    const requested = new URL(request.url).searchParams.get("download");
    const downloadAs = requested ? requested.replace(/[^\w.\- ]+/g, "").slice(0, 100) || file : undefined;
    let url: string;
    try {
      url = await storageSignedUrl(`${workspaceId}/uploads/${file}`, 3600, downloadAs);
    } catch {
      throw notFound("File");
    }
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
