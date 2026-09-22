import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser, revokeAllSessions, expiredSessionCookie } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

/**
 * POST /api/v1/auth/account/delete — soft-delete + anonymize + revoke.
 * Row purge is a documented Phase-12 operation; nothing here pretends
 * data vanished from backups.
 */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm." }) }));
    void body;
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    if (!user) throw validationError("Sign in to delete your account.");
    await db`
      UPDATE users
      SET status = 'deleted', deleted_at = now(), email = 'deleted_' || id || '@deleted.local', name = 'Deleted user', updated_at = now()
      WHERE id = ${user.id}
    `;
    await revokeAllSessions(user.id);
    const store = await cookies();
    const expired = expiredSessionCookie();
    store.set(expired.name, expired.value, expired.options as never);
    await audit({ userId: user.id, action: "auth.account_deleted", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
