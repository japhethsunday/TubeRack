import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, revokeOtherSessions, SESSION_COOKIE } from "@/src/server/auth";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse, unauthorized } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

/** POST /api/v1/auth/sessions/revoke-others — sign out every other device; keeps this one. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) throw unauthorized();
    await revokeOtherSessions(user.id, token);
    await audit({ userId: user.id, action: "auth.sessions_revoked", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: { revoked: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
