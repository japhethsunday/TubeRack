#!/usr/bin/env node
/**
 * Database migration runner: node db/migrate.mjs
 * Requires DATABASE_URL in the environment (see .env.example).
 * Applies pending *.sql files in order inside transactions and records
 * them in schema_migrations. Never drops tables. Safe to re-run.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add credentials first (see .env.example).");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((r) => r.version));
    const dir = path.join(__dirname, "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log(`skip ${version} (already applied)`);
        continue;
      }
      const text = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
      });
      console.log(`applied ${version}`);
      count += 1;
    }
    console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
