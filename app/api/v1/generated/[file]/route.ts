import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { storageSignedUrl } from "@/src/server/storage";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { notFound, rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

const FILE = /^[0-9a-f-]{36}-output\.(png|jpg|webp|wav|mp3|mp4|webm|srt|vtt)$/;

/** GET /api/v1/generated/:file — provider output, owner workspace only; redirects to a 1-hour signed link. */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const { file } = await params;
    if (!FILE.test(file)) throw validationError("Invalid file.");
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "viewer");
    let url: string;
    try {
      url = await storageSignedUrl(`${workspaceId}/generated/${file}`);
    } catch {
      throw notFound("File");
    }
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
