import { NextResponse } from "next/server";
import { getServerEnv, backendStatus } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
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
  if (status.storage) {
    try {
      const base = `${env.CLOUDNIVO_STORAGE_URL!.replace(/\/$/, "")}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `${base}/buckets/${encodeURIComponent(env.CLOUDNIVO_BUCKET)}`,
        { headers: { Authorization: `Bearer ${env.CLOUDNIVO_SECRET_KEY}` }, signal: controller.signal },
      );
      clearTimeout(timer);
      storageReachable = response.status !== 401 && response.status !== 403 ? true : false;
    } catch {
      storageReachable = false;
    }
  }

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
