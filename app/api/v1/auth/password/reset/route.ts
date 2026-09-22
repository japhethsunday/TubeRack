import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashPassword, hashToken } from "@/src/server/crypto";
import { revokeAllSessions } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody, passwordSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const resetSchema = z
  .object({
    token: z.string().min(10, "Invalid token."),
    password: passwordSchema,
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

/** POST /api/v1/auth/password/reset — consume token, set password, revoke sessions. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const body = await parseBody(request, resetSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      SELECT id, user_id, expires_at, consumed_at FROM auth_tokens
      WHERE token_hash = ${hashToken(body.token)} AND purpose = 'recovery' LIMIT 1
    `;
    const row = rows[0] as unknown as { id: string; user_id: string; expires_at: string; consumed_at: string | null } | undefined;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw validationError("This reset link is invalid or expired. Request a new one.");
    }
    await db`UPDATE auth_tokens SET consumed_at = now() WHERE id = ${row.id}`;
    await db`UPDATE users SET password_hash = ${await hashPassword(body.password)}, updated_at = now() WHERE id = ${row.user_id}`;
    await revokeAllSessions(row.user_id);
    await audit({ userId: row.user_id, action: "auth.password_reset", resourceType: "user", resourceId: row.user_id });
    return NextResponse.json({ data: { reset: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
