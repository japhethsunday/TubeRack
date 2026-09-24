import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { isStorageConfigured, storageSignedUpload } from "@/src/server/storage";
import { limiterFor } from "@/src/server/rate-limit";
import { backendUnavailable, rateLimited, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

// Matches the storage plan's per-file limit; larger media stays on the device.
const MAX_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mp4": "m4a",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
};

const body = z.object({
  mime: z.string().refine((m) => m in EXT, "Unsupported file type."),
  size: z.number().int().positive().max(MAX_BYTES, "Cloud storage takes files up to 50 MB — larger files are kept on your device."),
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
    const uploadUrl = await storageSignedUpload(`${workspaceId}/uploads/${file}`);
    return NextResponse.json({ data: { uploadUrl, fileUrl: `/api/v1/uploads/${file}` } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
