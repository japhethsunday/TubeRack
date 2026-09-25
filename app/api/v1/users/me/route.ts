import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { getDb } from "@/src/server/db";
import { toErrorResponse, backendUnavailable, validationError } from "@/src/server/errors";
import { parseBody, nameSchema } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { z } from "zod";

/** GET /api/v1/users/me — never includes password hashes or tokens. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      SELECT u.id, u.email, u.name, u.email_verified_at, u.status, u.created_at,
             COALESCE(json_agg(json_build_object('workspaceId', m.workspace_id, 'role', m.role)) FILTER (WHERE m.id IS NOT NULL), '[]') AS memberships
      FROM users u LEFT JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ${user.id} GROUP BY u.id LIMIT 1
    `;
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = z.object({ name: nameSchema.optional() }).refine((v) => v.name !== undefined, {
  message: "Nothing to update.",
});

/** PATCH /api/v1/users/me — profile name only. */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, patchSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    if (body.name === undefined) throw validationError("Nothing to update.");
    const rows = await db`
      UPDATE users SET name = ${body.name.trim()}, updated_at = now() WHERE id = ${user.id}
      RETURNING id, email, name, email_verified_at, status, created_at
    `;
    await audit({ userId: user.id, action: "user.updated", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
