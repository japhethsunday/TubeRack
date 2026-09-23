import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { storageGet } from "@/src/server/storage";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { notFound, rateLimited, toErrorResponse, validationError } from "@/src/server/errors";

const FILE = /^[0-9a-f-]{36}-output\.(png|jpg|webp|wav|mp3)$/;

/** GET /api/v1/generated/:file — provider output, only for the owning workspace. */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const { file } = await params;
    if (!FILE.test(file)) throw validationError("Invalid file.");
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "viewer");
    let object;
    try {
      object = await storageGet(`${workspaceId}/generated/${file}`);
    } catch {
      throw notFound("File");
    }
    return new Response(object.bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": object.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
