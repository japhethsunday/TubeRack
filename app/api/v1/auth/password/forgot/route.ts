import { NextResponse } from "next/server";
import { sharedLimit } from "@/src/server/shared-limit";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { newResetCode, resetCodeHash, RESET_CODE_TTL_MS } from "@/src/server/reset-code";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { parseBody, emailSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { sendRecoveryCodeEmail, __recordAttempt } from "@/src/server/email";

/** POST /api/v1/auth/password/forgot — emails a 6-digit code; account-agnostic: identical response either way. */
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
      const code = newResetCode();
      // Only the newest code works.
      await db`UPDATE auth_tokens SET consumed_at = now() WHERE user_id = ${row.id} AND purpose = 'recovery' AND consumed_at IS NULL`;
      await db`
        INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
        VALUES (${row.id}, 'recovery', ${resetCodeHash(row.id, code)}, ${new Date(Date.now() + RESET_CODE_TTL_MS).toISOString()})
      `;
      __recordAttempt({ to: body.email, subject: "Your Recktube reset code", text: "Recovery code.", kind: "recovery" });
      await sendRecoveryCodeEmail(request, body.email, code);
    }
    // Identical response whether or not the account exists.
    return NextResponse.json(
      { data: { submitted: true, message: "If an account exists for that address, a 6-digit code is on its way. It expires in 15 minutes." } },
      { status: 202 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
