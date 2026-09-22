import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashPassword, verifyPassword } from "@/src/server/crypto";
import { requireUser, revokeOtherSessions, SESSION_COOKIE } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable, unauthorized } from "@/src/server/errors";
import { parseBody, passwordSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const changeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: passwordSchema,
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

/** POST /api/v1/auth/password/change — keeps current session, revokes others. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, changeSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`SELECT password_hash FROM users WHERE id = ${user.id} LIMIT 1`;
    const row = rows[0] as { password_hash: string } | undefined;
    if (!row || !(await verifyPassword(body.current, row.password_hash))) {
      throw unauthorized("Current password is incorrect.");
    }
    await db`UPDATE users SET password_hash = ${await hashPassword(body.password)}, updated_at = now() WHERE id = ${user.id}`;
    const store = await cookies();
    const current = store.get(SESSION_COOKIE)?.value;
    if (current) await revokeOtherSessions(user.id, current);
    await audit({ userId: user.id, action: "auth.password_changed", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: { changed: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
