import { getDb } from "@/src/server/db";
import { rateLimited } from "@/src/server/errors";

/**
 * Fixed-window limit shared by every server instance (Postgres-backed).
 * Throws RATE_LIMITED when exceeded. If the database is unreachable the
 * in-memory limiters still apply, so this fails open rather than locking
 * everyone out.
 */
export async function sharedLimit(key: string, max: number, windowSec: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  let row: { count: number; window_start: string } | undefined;
  try {
    const rows = await db`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_limits.window_start END
      RETURNING count, window_start
    `;
    row = rows[0] as unknown as { count: number; window_start: string };
  } catch (error) {
    console.error("shared limit unavailable:", error instanceof Error ? error.message : String(error));
    return;
  }
  if (row && row.count > max) {
    const resetsIn = Math.ceil(windowSec - (Date.now() - new Date(row.window_start).getTime()) / 1000);
    throw rateLimited(Math.max(1, resetsIn));
  }
}

/** Housekeeping for the daily cron: drop counters older than a day. */
export async function pruneSharedLimits(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}
