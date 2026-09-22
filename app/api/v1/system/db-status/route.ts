import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { getDb } from "@/src/server/db";
import { backendUnavailable, toErrorResponse } from "@/src/server/errors";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";

/** Applied migration state. Authenticated users only (ops visibility). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await requireUser();
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    let applied: string[] = [];
    try {
      const rows = await db`SELECT version FROM schema_migrations ORDER BY version`;
      applied = rows.map((r) => (r as { version: string }).version);
    } catch {
      applied = [];
    }
    return NextResponse.json({ data: { applied, expected: ["001_core", "002_content", "003_platform", "004_project_extras", "005_jobs"], upToDate: applied.length >= 5 } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
