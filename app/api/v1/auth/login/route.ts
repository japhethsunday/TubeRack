import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { verifyPassword } from "@/src/server/crypto";
import { createSession, sessionCookie } from "@/src/server/auth";
import { toErrorResponse, unauthorized, backendUnavailable } from "@/src/server/errors";
import { parseBody, emailSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

/** POST /api/v1/auth/login — generic failure message (no account oracle). */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const body = await parseBody(request, loginSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");

    const rows = await db`
      SELECT id, email, name, password_hash, status, email_verified_at
      FROM users WHERE lower(email) = ${body.email.toLowerCase()} AND deleted_at IS NULL LIMIT 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    const fail = unauthorized("Email or password is incorrect.");
    if (!row || row.status !== "active") throw fail;
    const ok = await verifyPassword(body.password, String(row.password_hash));
    if (!ok) throw fail;

    const token = await createSession(String(row.id), {
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    const cookie = sessionCookie(token);
    const store = await cookies();
    store.set(cookie.name, cookie.value, cookie.options as never);
    await audit({ userId: String(row.id), action: "auth.login", resourceType: "user", resourceId: String(row.id) });
    return NextResponse.json({
      data: { user: { id: row.id, email: row.email, name: row.name, emailVerifiedAt: row.email_verified_at } },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
