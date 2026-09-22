import postgres from "postgres";
import { getServerEnv } from "@/src/lib/env";

/**
 * CloudNivo Postgres client (lazy singleton). All queries are parameterized
 * through the `postgres` tagged template — no string-built SQL anywhere.
 */

let client: ReturnType<typeof postgres> | null = null;
let warned = false;

export function isDbConfigured(env = getServerEnv()): boolean {
  return Boolean(env.CLOUDNIVO_DATABASE_URL);
}

export function getDb(): ReturnType<typeof postgres> | null {
  let env;
  try {
    env = getServerEnv();
  } catch {
    return null;
  }
  if (!env.CLOUDNIVO_DATABASE_URL) return null;
  if (!client) {
    client = postgres(env.CLOUDNIVO_DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Never log statements (could contain PII); errors surfaced via BackendError.
      onnotice: () => {},
    });
  }
  return client;
}

/** For tests and shutdown: reset the singleton. */
export function __resetDb(): void {
  if (client) {
    void client.end({ timeout: 2 }).catch(() => {});
    client = null;
  }
  warned = false;
}

export function __markWarned(): void {
  warned = true;
}

export function __wasWarned(): boolean {
  return warned;
}
