-- 005_jobs.sql — generic execution records for generation, render,
-- transcription, and audio jobs. User-facing drafts (render_requests etc.)
-- stay untouched; jobs track execution with atomic status transitions,
-- retry budgets, and idempotency keys for safe retries.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('render', 'generation', 'transcription', 'audio')),
  provider TEXT NOT NULL DEFAULT '' CHECK (char_length(provider) <= 60),
  model TEXT NOT NULL DEFAULT '' CHECK (char_length(model) <= 120),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying')),
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB NOT NULL DEFAULT '{}',
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error TEXT,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts >= 1 AND max_attempts <= 10),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_uidx
  ON jobs (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_workspace_status_idx
  ON jobs (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_project_idx
  ON jobs (project_id) WHERE project_id IS NOT NULL;
