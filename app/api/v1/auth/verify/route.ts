import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashToken } from "@/src/server/crypto";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const tokenSchema = z.object({ token: z.string().min(10, "Invalid token.") });

/** POST /api/v1/auth/verify — consume a verification token. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const body = await parseBody(request, tokenSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      SELECT id, user_id, expires_at, consumed_at FROM auth_tokens
      WHERE token_hash = ${hashToken(body.token)} AND purpose = 'verify' LIMIT 1
    `;
    const row = rows[0] as unknown as { id: string; user_id: string; expires_at: string; consumed_at: string | null } | undefined;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw validationError("This verification link is invalid or expired. Request a new one.");
    }
    await db`UPDATE auth_tokens SET consumed_at = now() WHERE id = ${row.id}`;
    await db`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = ${row.user_id}`;
    await audit({ userId: row.user_id, action: "auth.verified", resourceType: "user", resourceId: row.user_id });
    return NextResponse.json({ data: { verified: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
