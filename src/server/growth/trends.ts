import { getDb } from "@/src/server/db";
import { scanNiche } from "@/src/server/youtube/client";
import { trendResult, type TrendResult } from "@/src/lib/growth/trends";
import { conflict, validationError } from "@/src/server/errors";

export const MAX_WATCHES = 5;

export interface TrendWatch {
  id: string;
  user_id: string;
  query: string;
  region: string;
  email_digest: boolean;
  last_run_at: string | null;
  last_results: TrendResult | Record<string, never>;
}

function db() {
  const d = getDb();
  if (!d) throw new Error("Database unavailable.");
  return d;
}

export async function listWatches(workspaceId: string): Promise<TrendWatch[]> {
  const rows = await db()`SELECT id, user_id, query, region, email_digest, last_run_at, last_results FROM trend_watches WHERE workspace_id = ${workspaceId} ORDER BY created_at`;
  return rows as unknown as TrendWatch[];
}

export async function addWatch(workspaceId: string, userId: string, input: { query: string; region: string; emailDigest: boolean }): Promise<TrendWatch> {
  const existing = await listWatches(workspaceId);
  if (existing.length >= MAX_WATCHES) throw validationError(`Trend radar watches up to ${MAX_WATCHES} topics (each daily scan uses ~102 YouTube units).`);
  if (existing.some((w) => w.query.toLowerCase() === input.query.toLowerCase() && w.region === input.region)) throw conflict("You're already watching that topic.");
  const rows = await db()`
    INSERT INTO trend_watches (workspace_id, user_id, query, region, email_digest)
    VALUES (${workspaceId}, ${userId}, ${input.query}, ${input.region}, ${input.emailDigest})
    RETURNING id, user_id, query, region, email_digest, last_run_at, last_results
  `;
  return rows[0] as unknown as TrendWatch;
}

export async function updateWatch(workspaceId: string, id: string, emailDigest: boolean): Promise<void> {
  await db()`UPDATE trend_watches SET email_digest = ${emailDigest} WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}

export async function removeWatch(workspaceId: string, id: string): Promise<void> {
  await db()`DELETE FROM trend_watches WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}

/** Scan one watch: most-viewed uploads of the last 7 days, ranked by views/hour. */
export async function runWatch(watch: TrendWatch): Promise<TrendResult> {
  const { samples } = await scanNiche(watch.query, { days: 7, maxResults: 20, regionCode: watch.region || undefined });
  const prev = "videos" in watch.last_results ? watch.last_results.videos.map((v) => v.videoId) : [];
  const result = trendResult(samples, prev);
  await db()`UPDATE trend_watches SET last_results = ${JSON.stringify(result)}::jsonb, last_run_at = now() WHERE id = ${watch.id}`;
  return result;
}
