import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable } from "@/src/server/errors";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

/** POST /api/v1/notifications/read-all — mark own notifications read. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${user.id} AND read_at IS NULL
      RETURNING id
    `;
    await audit({ userId: user.id, action: "notifications.read_all", resourceType: "notifications", resourceId: user.id });
    return NextResponse.json({ data: { marked: rows.length } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
