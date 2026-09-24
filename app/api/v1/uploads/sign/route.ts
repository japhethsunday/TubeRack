import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { isStorageConfigured, storageSignedUpload } from "@/src/server/storage";
import { limiterFor } from "@/src/server/rate-limit";
import { BackendError, backendUnavailable, rateLimited, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { MAX_PARTS, PART_BYTES, partCount } from "@/src/lib/media/chunked";

// The storage plan caps one object at 50 MB; bigger files upload as parts
// (see src/lib/media/chunked.ts).
const MAX_BYTES = PART_BYTES * MAX_PARTS;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mp4": "m4a",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
};

const body = z.object({
  mime: z.string().refine((m) => m in EXT, "Unsupported file type."),
  size: z.number().int().positive().max(MAX_BYTES, "Files over 2.8 GB are kept on your device."),
});

/**
 * POST /api/v1/uploads/sign — one signed upload link for the caller's
 * workspace. Returns where to PUT the bytes and the app URL to reference.
 * Content was already sniffed client-side; the bucket stays private.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("upload").take(`upload:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "editor");
    if (!isStorageConfigured()) throw backendUnavailable("File storage");
    const input = await parseBody(request, body);
    const file = `${crypto.randomUUID()}.${EXT[input.mime]}`;
    const parts = partCount(input.size);
    const sign = (key: string) =>
      storageSignedUpload(key).catch(() => {
        throw new BackendError("BACKEND_UNAVAILABLE", "Cloud storage is unreachable right now.");
      });
    if (parts === 1) {
      const uploadUrl = await sign(`${workspaceId}/uploads/${file}`);
      return NextResponse.json({ data: { uploadUrl, uploadUrls: [uploadUrl], partBytes: PART_BYTES, fileUrl: `/api/v1/uploads/${file}` } });
    }
    const uploadUrls: string[] = [];
    for (let i = 0; i < parts; i++) uploadUrls.push(await sign(`${workspaceId}/uploads/${file}.part${i}`));
    return NextResponse.json({ data: { uploadUrl: uploadUrls[0], uploadUrls, partBytes: PART_BYTES, fileUrl: `/api/v1/uploads/${file}?parts=${parts}` } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
