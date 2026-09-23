import { NextResponse } from "next/server";
import { getServerEnv, backendStatus } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { storagePing } from "@/src/server/storage";
import packageJson from "@/package.json";

/**
 * Public backend status: configuration presence + live reachability.
 * Contains no secrets, no versions of sensitive components.
 */
export async function GET() {
  const env = getServerEnv();
  const status = backendStatus(env);
  let databaseReachable: boolean | null = null;
  let storageReachable: boolean | null = null;

  const db = getDb();
  if (db && status.database) {
    try {
      await db`SELECT 1 AS ok`;
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }
  if (status.storage) storageReachable = await storagePing();

  return NextResponse.json({
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
  });
}
