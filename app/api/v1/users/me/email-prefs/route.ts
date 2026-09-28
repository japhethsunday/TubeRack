import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { getDb } from "@/src/server/db";
import { audit } from "@/src/server/audit";
import { backendUnavailable, rateLimited, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";

async function read(userId: string) {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const [u] = await db`SELECT marketing_opt_in FROM users WHERE id = ${userId}`;
  const [w] = await db`SELECT count(*) AS n, count(*) FILTER (WHERE email_digest) AS on FROM trend_watches WHERE user_id = ${userId}`;
  return { marketing: Boolean(u?.marketing_opt_in), briefs: Number(w?.n ?? 0) === 0 ? true : Number(w?.on ?? 0) > 0 };
}

/** GET /api/v1/users/me/email-prefs — the account's email choices (all devices). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`prefs:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    return NextResponse.json({ data: await read(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ marketing: z.boolean().optional(), briefs: z.boolean().optional() });

/** PUT /api/v1/users/me/email-prefs — turn marketing email and trend briefs on or off. */
export async function PUT(request: Request) {
  try {
    const limit = limiterFor("write").take(`prefs:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const input = await parseBody(request, body);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    if (input.marketing !== undefined) {
      await db`UPDATE users SET marketing_opt_in = ${input.marketing}, marketing_opt_in_at = ${input.marketing ? new Date().toISOString() : null} WHERE id = ${user.id}`;
      await audit({ userId: user.id, action: input.marketing ? "email.marketing.opt_in" : "email.marketing.opt_out" });
    }
    if (input.briefs !== undefined) await db`UPDATE trend_watches SET email_digest = ${input.briefs} WHERE user_id = ${user.id}`;
    return NextResponse.json({ data: await read(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
