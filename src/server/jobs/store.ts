import { getDb } from "@/src/server/db";
import { backendUnavailable } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

/**
 * Job store: execution records for render/generation/transcription/audio
 * work. All transitions are single atomic UPDATEs guarded by the current
 * status, so concurrent runners cannot double-claim or resurrect finished
 * jobs. Retries are idempotent via (workspace_id, idempotency_key).
 */

export const JOB_TYPES = ["render", "generation", "transcription", "audio"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "processing", "completed", "failed", "cancelled", "retrying"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Pure state machine: which transitions a runner may attempt. */
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed", "retrying", "cancelled"],
  retrying: ["processing", "cancelled"],
  completed: [],
  failed: ["retrying"],
  cancelled: ["retrying"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function clampProgress(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(100, Math.max(0, n));
}

export interface JobRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  actor_id: string | null;
  type: JobType;
  provider: string;
  model: string;
  status: JobStatus;
  input: unknown;
  output: unknown;
  progress: number;
  error: string | null;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface CreateJobInput {
  workspaceId: string;
  actorId?: string;
  projectId?: string;
  type: JobType;
  provider?: string;
  model?: string;
  input?: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
}

function rowOf(raw: Record<string, unknown>): JobRow {
  return raw as unknown as JobRow;
}

/** Create a job. Replays safely: same idempotency key returns the existing row. */
export async function createJob(input: CreateJobInput): Promise<JobRow> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  if (!JOB_TYPES.includes(input.type)) throw new Error(`Unknown job type: ${input.type}.`);
  const maxAttempts =
    typeof input.maxAttempts === "number" && Number.isInteger(input.maxAttempts)
      ? Math.min(10, Math.max(1, input.maxAttempts))
      : 3;
  try {
    const rows = await db`
      INSERT INTO jobs (workspace_id, project_id, actor_id, type, provider, model, input, max_attempts, idempotency_key)
      VALUES (${input.workspaceId}, ${input.projectId ?? null}, ${input.actorId ?? null}, ${input.type},
              ${String(input.provider ?? "").slice(0, 60)}, ${String(input.model ?? "").slice(0, 120)},
              ${JSON.stringify(input.input ?? {})}, ${maxAttempts}, ${input.idempotencyKey ?? null})
      RETURNING *`;
    const job = rowOf(rows[0] as Record<string, unknown>);
    await audit({ workspaceId: input.workspaceId, userId: input.actorId, action: "job.created", resourceType: "job", resourceId: job.id });
    return job;
  } catch (error) {
    if ((error as { code?: string })?.code === "23505" && input.idempotencyKey) {
      const existing = await db`SELECT * FROM jobs WHERE workspace_id = ${input.workspaceId} AND idempotency_key = ${input.idempotencyKey} LIMIT 1`;
      if (existing.length > 0) return rowOf(existing[0] as Record<string, unknown>);
    }
    throw error;
  }
}

/** Atomically claim a queued/retrying job for execution (increments attempts). */
export async function claimJob(id: string, workspaceId: string): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    UPDATE jobs SET status = 'processing', attempts = attempts + 1, started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status IN ('queued', 'retrying')
    RETURNING *`;
  return rows.length > 0 ? rowOf(rows[0] as Record<string, unknown>) : null;
}

export async function reportProgress(id: string, workspaceId: string, progress: unknown): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    UPDATE jobs SET progress = ${clampProgress(progress)}, updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status = 'processing'
    RETURNING *`;
  return rows.length > 0 ? rowOf(rows[0] as Record<string, unknown>) : null;
}

export async function completeJob(id: string, workspaceId: string, output: unknown): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    UPDATE jobs SET status = 'completed', output = ${JSON.stringify(output ?? {})}, progress = 100, finished_at = now(), updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status = 'processing'
    RETURNING *`;
  if (rows.length > 0) {
    await audit({ workspaceId, action: "job.completed", resourceType: "job", resourceId: id });
    return rowOf(rows[0] as Record<string, unknown>);
  }
  return null;
}

/** Fail a job: retries while attempts remain, terminal otherwise (atomic). */
export async function failJob(id: string, workspaceId: string, error: unknown): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const rows = await db`
    UPDATE jobs
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
        error = ${message},
        finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE finished_at END,
        updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status = 'processing'
    RETURNING *`;
  if (rows.length > 0) {
    await audit({ workspaceId, action: "job.failed", resourceType: "job", resourceId: id });
    return rowOf(rows[0] as Record<string, unknown>);
  }
  return null;
}

export async function cancelJob(id: string, workspaceId: string, actorId?: string): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    UPDATE jobs SET status = 'cancelled', finished_at = now(), updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status IN ('queued', 'processing', 'retrying')
    RETURNING *`;
  if (rows.length > 0) {
    await audit({ workspaceId, userId: actorId, action: "job.cancelled", resourceType: "job", resourceId: id });
    return rowOf(rows[0] as Record<string, unknown>);
  }
  return null;
}

/** Re-queue a failed/cancelled job for another attempt. */
export async function retryJob(id: string, workspaceId: string, actorId?: string): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    UPDATE jobs SET status = 'retrying', error = NULL, finished_at = NULL, progress = 0, updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspaceId} AND status IN ('failed', 'cancelled')
    RETURNING *`;
  if (rows.length > 0) {
    await audit({ workspaceId, userId: actorId, action: "job.retried", resourceType: "job", resourceId: id });
    return rowOf(rows[0] as Record<string, unknown>);
  }
  return null;
}

export async function getJob(id: string, workspaceId: string): Promise<JobRow | null> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`SELECT * FROM jobs WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`;
  return rows.length > 0 ? rowOf(rows[0] as Record<string, unknown>) : null;
}

export async function listJobs(
  workspaceId: string,
  filter: { status?: JobStatus; type?: JobType; projectId?: string; limit?: number } = {},
): Promise<JobRow[]> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const limit = typeof filter.limit === "number" ? Math.min(200, Math.max(1, Math.floor(filter.limit))) : 100;
  const rows = await db`
    SELECT * FROM jobs WHERE workspace_id = ${workspaceId}
    ${filter.status ? db`AND status = ${filter.status}` : db``}
    ${filter.type ? db`AND type = ${filter.type}` : db``}
    ${filter.projectId ? db`AND project_id = ${filter.projectId}` : db``}
    ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => rowOf(r as Record<string, unknown>));
}

/** Oldest runnable jobs across workspaces (worker use only; server-side). */
export async function nextRunnableJobs(limit = 5): Promise<{ id: string; workspace_id: string }[]> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const rows = await db`
    SELECT id, workspace_id FROM jobs
    WHERE status IN ('queued', 'retrying')
    ORDER BY created_at ASC LIMIT ${Math.min(20, Math.max(1, limit))}`;
  return rows as unknown as { id: string; workspace_id: string }[];
}

/** True when a job was cancelled mid-run (runner checks between steps). */
export async function isCancelled(id: string, workspaceId: string): Promise<boolean> {
  const job = await getJob(id, workspaceId);
  return job?.status === "cancelled";
}
