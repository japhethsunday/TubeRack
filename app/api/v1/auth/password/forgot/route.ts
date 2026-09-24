import { NextResponse } from "next/server";
import { sharedLimit } from "@/src/server/shared-limit";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashToken, randomToken } from "@/src/server/crypto";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { parseBody, emailSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { sendRecoveryEmail, __recordAttempt } from "@/src/server/email";

/** POST /api/v1/auth/password/forgot — account-agnostic: identical response either way. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const body = await parseBody(request, z.object({ email: emailSchema }));
    await sharedLimit(`forgot:${clientKey(request)}`, 10, 3600);
    await sharedLimit(`forgot:email:${body.email.toLowerCase()}`, 3, 3600);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");

    const rows = await db`
      SELECT id FROM users WHERE lower(email) = ${body.email.toLowerCase()} AND deleted_at IS NULL AND status = 'active' LIMIT 1
    `;
    const row = rows[0] as { id: string } | undefined;
    if (row) {
      const token = randomToken(24);
      await db`
        INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
        VALUES (${row.id}, 'recovery', ${hashToken(token)}, ${new Date(Date.now() + 3600000).toISOString()})
      `;
      __recordAttempt({ to: body.email, subject: "Reset your TubeRack password", text: "Recovery link.", kind: "recovery" });
      await sendRecoveryEmail(request, body.email, token);
    }
    // Identical response whether or not the account exists.
    return NextResponse.json(
      { data: { submitted: true, message: "If an account exists for that address, a reset link is on its way. It expires in 60 minutes." } },
      { status: 202 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
