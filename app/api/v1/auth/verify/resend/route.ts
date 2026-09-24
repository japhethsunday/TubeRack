import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { hashToken, randomToken } from "@/src/server/crypto";
import { requireUser } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { sendVerificationEmail, __recordAttempt } from "@/src/server/email";

/** POST /api/v1/auth/verify/resend — fresh token; delivery waits on email provider. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const token = randomToken(24);
    await db`
      INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (${user.id}, 'verify', ${hashToken(token)}, ${new Date(Date.now() + 24 * 3600000).toISOString()})
    `;
    __recordAttempt({ to: user.email, subject: "Verify your TubeRack email", text: "Verification link.", kind: "verify" });
    const result = await sendVerificationEmail(request, user.email, token);
    await audit({ userId: user.id, action: "auth.verify_resent", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: { requested: true, sent: result.sent, reason: result.reason } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
