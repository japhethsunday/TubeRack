import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashToken, randomToken } from "@/src/server/crypto";
import { resetCodeHash, isResetCode } from "@/src/server/reset-code";
import { sharedLimit } from "@/src/server/shared-limit";
import { toErrorResponse, backendUnavailable, validationError, rateLimited } from "@/src/server/errors";
import { parseBody, emailSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";

const body = z.object({ email: emailSchema, code: z.string().trim().refine(isResetCode, "Enter the 6-digit code.") });

/**
 * POST /api/v1/auth/password/verify-code — trade the emailed code for a
 * short-lived reset token (used by /password/reset). Five tries per address
 * per 15 minutes; the error never says whether the account exists.
 */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const input = await parseBody(request, body);
    const email = input.email.toLowerCase();
    await sharedLimit(`reset-code:${clientKey(request)}`, 20, 900);
    await sharedLimit(`reset-code:email:${email}`, 5, 900);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const users = await db`SELECT id FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL AND status = 'active' LIMIT 1`;
    const user = users[0] as { id: string } | undefined;
    const rows = user
      ? await db`
          SELECT id, expires_at, consumed_at FROM auth_tokens
          WHERE token_hash = ${resetCodeHash(user.id, input.code)} AND purpose = 'recovery' LIMIT 1
        `
      : [];
    const row = rows[0] as unknown as { id: string; expires_at: string; consumed_at: string | null } | undefined;
    if (!user || !row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw validationError("That code is wrong or expired. Check the latest email or send a new code.");
    }
    const token = randomToken(24);
    await db`UPDATE auth_tokens SET consumed_at = now() WHERE id = ${row.id}`;
    await db`
      INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (${user.id}, 'recovery', ${hashToken(token)}, ${new Date(Date.now() + 15 * 60 * 1000).toISOString()})
    `;
    return NextResponse.json({ data: { token } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
