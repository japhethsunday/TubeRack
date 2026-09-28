import { NextResponse } from "next/server";
import { getServerEnv, backendStatus } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { storagePing } from "@/src/server/storage";
import packageJson from "@/package.json";
import { limiterFor, clientKey } from "@/src/server/rate-limit";

/** Result cache: probes run at most every 30 s, however often this is called. */
let cached: { at: number; body: unknown } | null = null;

/**
 * Public backend status: configuration presence + live reachability.
 * Contains no secrets, no versions of sensitive components.
 */
export async function GET(request: Request) {
  const limit = limiterFor("read").take(`status:${clientKey(request)}`);
  if (limit.allowed === false) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  if (cached && Date.now() - cached.at < 30_000) return NextResponse.json(cached.body);
  const env = getServerEnv();
  const status = backendStatus(env);
  let databaseReachable: boolean | null = null;
  let storageReachable: boolean | null = null;

  const db = getDb();
  if (db && status.database) {
    try {
      await db`SELECT 1 AS ok`;
      databaseReachable = true;
    } catch (error) {
      databaseReachable = false;
      // Server log only (no secrets: driver messages never include the password).
      console.error("db-status: database unreachable:", error instanceof Error ? error.message : String(error));
    }
  }
  if (status.storage) storageReachable = await storagePing();

  const body = {
    service: "tuberack",
    version: (packageJson as { version: string }).version,
    phase: 11,
    backend: {
      databaseConfigured: status.database,
      databaseReachable,
      storageConfigured: status.storage,
      storageReachable,
      authReady: status.auth,
      emailConfigured: status.email,
    },
  };
  cached = { at: Date.now(), body };
  return NextResponse.json(body);
}
